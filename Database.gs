function saveQuizData(title, settingsJson, questionsJson) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Quizzes');
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet('Quizzes');
    sheet.appendRow(['Quiz ID', 'Title', 'Settings JSON', 'Questions JSON', 'Creation Date', 'Creator Email']); 
    sheet.getRange("A1:F1").setFontWeight("bold");
  }

  const quizId = Utilities.getUuid(); 
  const creationDate = new Date();
  const creatorEmail = Session.getActiveUser().getEmail(); // NEW: Grab their identity!

  // Append everything into a new row (Notice the 6th variable!)
  sheet.appendRow([quizId, title, settingsJson, questionsJson, creationDate, creatorEmail]);

  return quizId; 
}

// FETCH ALL QUIZZES FOR THE SIDEBAR
function getAllQuizzes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  if (!sheet) return { isAdmin: false, quizzes: [] }; 
  
  const data = sheet.getDataRange().getValues();
  const quizzes = [];
  
  const isAdmin = checkAdminStatus();
  const myEmail = Session.getActiveUser().getEmail().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0] || data[i][0] === '') continue;
    
    const creatorEmail = data[i][5] ? String(data[i][5]).trim().toLowerCase() : "Unknown Creator";
    // NEW: Grab the Collaborators list from Column 7 (Index 6)
    const collabs = data[i][6] ? String(data[i][6]).toLowerCase() : "";
    const isCollab = collabs.split(',').map(e => e.trim()).includes(myEmail);
    
    // Show it if they are an Admin, the Creator, OR a Collaborator!
    if (isAdmin || creatorEmail === myEmail || isCollab) {
      quizzes.push({
        id: data[i][0],
        title: data[i][1],
        creator: creatorEmail
      });
    }
  }
  // Return the admin status, the current user's email, AND the quiz list!
  return { isAdmin: isAdmin, currentUser: myEmail, quizzes: quizzes };
}

// --- CREATOR: GET DETAILS FOR DASHBOARD ---
function getQuizDetails(quizId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = "quiz_v2_" + quizId;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return JSON.parse(cachedData); 

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  if (!sheet) return null;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      const quizObject = {
        id: String(data[i][0]),
        title: String(data[i][1]),
        settings: String(data[i][2]),
        questions: String(data[i][3]),
        date: String(data[i][4]),
        creator: String(data[i][5] || ""),
        collaborators: String(data[i][6] || "") // NEW: Send collab data to frontend
      };
      cache.put(cacheKey, JSON.stringify(quizObject), 21600);
      return quizObject;
    }
  }
  return null;
}

// --- SECURITY: SECURE DELETE ---
function deleteQuizData(quizId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  const data = sheet.getDataRange().getValues();
  const isAdmin = checkAdminStatus();
  const myEmail = Session.getActiveUser().getEmail().toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      const creator = String(data[i][5]).trim().toLowerCase();
      
      // CRITICAL CHECK: Only the Creator or an Admin can delete!
      if (isAdmin || creator === myEmail) {
        sheet.deleteRow(i + 1);
        CacheService.getScriptCache().remove("quiz_v2_" + quizId);
        return true;
      } else {
        throw new Error("Access Denied: Only the owner or an Admin can delete this quiz.");
      }
    }
  }
  return false;
}

// --- DUPLICATION ENGINE (SECURED) ---
function duplicateQuiz(quizId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  const data = sheet.getDataRange().getValues();
  
  const isAdmin = checkAdminStatus();
  const myEmail = Session.getActiveUser().getEmail().toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      
      const creator = String(data[i][5]).trim().toLowerCase();
      const collabs = String(data[i][6]).toLowerCase().split(',').map(e => e.trim());
      
      // CRITICAL SECURITY CHECK: Are they an Admin, the Creator, or a Collaborator?
      if (isAdmin || creator === myEmail || collabs.includes(myEmail)) {
        
        // 1. Grab the existing data and append "Copy of" to the title
        const newTitle = "Copy of " + String(data[i][1]);
        const settings = String(data[i][2]);
        const questions = String(data[i][3]);
        
        // 2. Feed it back into your existing save function to generate a fresh ID.
        // This automatically assigns the person clicking "Duplicate" as the new Creator!
        return saveQuizData(newTitle, settings, questions); 
        
      } else {
        throw new Error("Access Denied: You do not have permission to duplicate this quiz.");
      }
    }
  }
  throw new Error("Original quiz not found.");
}

// --- TAKER: GRADE AND SAVE RESPONSE ---
function saveResponse(quizId, email, answersJson) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const quizSheet = spreadsheet.getSheetByName('Quizzes');
  
  // 1. Fetch Quiz Data
  const quizData = quizSheet.getDataRange().getValues();
  let quizSettings = {};
  let questions = [];
  
  for (let i = 1; i < quizData.length; i++) {
    if (quizData[i][0] === quizId) {
      quizSettings = JSON.parse(quizData[i][2] || '{}');
      questions = JSON.parse(quizData[i][3] || '[]');
      break;
    }
  }

  if (questions.length === 0) throw new Error("Quiz data not found.");

  // 2. Determine the Denominator (How many questions were ACTUALLY asked?)
  const qToShow = parseInt(quizSettings.questionsToShow) || 0;
  const expectedTotal = (qToShow > 0 && qToShow < questions.length) ? qToShow : questions.length;

  const parsedAnswers = JSON.parse(answersJson);
  let correctCount = 0;
  let details = [];

  // 3. Grade ONLY the questions that were submitted by this user
  questions.forEach((q, index) => {
    const qKey = `q_${index}`;
    
    // Only grade it if it was part of their randomized subset!
    if (parsedAnswers.hasOwnProperty(qKey)) {
      const submittedArr = parsedAnswers[qKey];
      const correctOptions = q.options.filter(opt => opt.isCorrect).map(opt => opt.text).sort();
      const submittedSorted = [...submittedArr].sort();
      
      const isCorrect = JSON.stringify(correctOptions) === JSON.stringify(submittedSorted);
      if (isCorrect) correctCount++;
      
      details.push({
        question: q.question,
        submitted: submittedArr.length > 0 ? submittedArr.join(", ") : "No Answer",
        correct: correctOptions.join(", "),
        isCorrect: isCorrect
      });
    }
  });

  const scorePercent = Math.round((correctCount / expectedTotal) * 100) + "%";

  // 4. Save to Responses Sheet
  let responseSheet = spreadsheet.getSheetByName('Responses');
  if (!responseSheet) {
    responseSheet = spreadsheet.insertSheet('Responses');
    responseSheet.appendRow(['Quiz ID', 'Respondent Email', 'Answers JSON', 'Score', 'Date Submitted']);
    responseSheet.getRange("A1:E1").setFontWeight("bold");
  }

  responseSheet.appendRow([quizId, email, answersJson, scorePercent, new Date()]);

  return JSON.stringify({ score: scorePercent, details: details });
}

// FETCH RESPONSES FOR DASHBOARD (Final Clean Version)
function getQuizResponses(quizId) {
  // Force Google Sheets to clear any pending data cache
  SpreadsheetApp.flush(); 
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Responses');
  if (!sheet) return []; 
  
  const data = sheet.getDataRange().getValues();
  const searchId = String(quizId).trim();
  let responses = [];
  
  // Loop through every single row
  for (let i = 0; i < data.length; i++) {
    const rowId = String(data[i][0]).trim();
    
    // Only grab it if it is an exact match for this specific quiz!
    if (rowId === searchId && rowId !== 'Quiz ID') {
      responses.push({
        email: data[i][1],
        score: String(data[i][3]).replace("'", ""), // Strip out our protective apostrophe for display
        date: String(data[i][4])
      });
    }
  }
  
  // Return the list (reversed so newest is at the top)
  return responses.reverse(); 
}

// SECURE LOAD: Auto-detect email, get past scores, and check attempt limits/dates
function loadSecureQuizForUser(quizId) {
  const userEmail = Session.getActiveUser().getEmail();
  const quizDetails = getQuizDetails(quizId);
  if (!quizDetails) return { status: "not_found" };

  const settings = JSON.parse(quizDetails.settings || '{}');
  const maxAttempts = parseInt(settings.maxAttempts) || 0;
  
  // --- NEW: CHECK EXPIRATION AND START DATES ---
  const now = new Date();
  
  if (settings.endDate && settings.endDate !== "") {
    if (now > new Date(settings.endDate)) {
      return { 
        status: "blocked", 
        email: userEmail,
        message: "This assessment has already expired. Please contact your administrator." 
      };
    }
  }

  if (settings.startDate && settings.startDate !== "") {
    if (now < new Date(settings.startDate)) {
      return { 
        status: "blocked", 
        email: userEmail,
        message: "This assessment is not available yet. Please check back later." 
      };
    }
  }
  // ---------------------------------------------
  
  let pastAttempts = 0;
  let pastScores = []; 

  if (userEmail) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Responses');
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === quizId && data[i][1] === userEmail) {
          pastAttempts++;
          // Save the score and date for the landing page
          pastScores.push({
            score: String(data[i][3]).replace("'", ""),
            date: String(data[i][4]) // <--- THE FIX: Wrapped in String() so it doesn't crash!
          });
        }
      }
    }
  }

  return {
    status: "allowed",
    email: userEmail || "Auto-detection pending deployment update",
    quizData: quizDetails,
    pastAttempts: pastAttempts,
    pastScores: pastScores 
  };
}

// --- CREATOR: UPDATE EXISTING QUIZ SETTINGS ---
function updateQuizSettings(quizId, title, settingsJson) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  if (!sheet) return false;
  
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      sheet.getRange(i + 1, 2).setValue(title);
      sheet.getRange(i + 1, 3).setValue(settingsJson);
      
      // NEW: Clear the old cache so the new settings take effect immediately!
      CacheService.getScriptCache().remove("quiz_v2_" + quizId);
      
      return true;
    }
  }
  return false;
}

// --- CREATOR: GET RAW RESPONSES FOR ITEM ANALYSIS ---
function getRawQuizResponses(quizId) {
  SpreadsheetApp.flush(); 
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Responses');
  if (!sheet) return []; 
  
  const data = sheet.getDataRange().getValues();
  const searchId = String(quizId).trim();
  let responses = [];
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === searchId) {
      responses.push({
        email: String(data[i][1]),
        answersJson: String(data[i][2]), // The raw data of exactly what they clicked
        score: String(data[i][3]).replace("'", ""), 
        date: String(data[i][4])
      });
    }
  }
  return responses; 
}

// --- ADMIN: SEND INVITATION EMAIL ---
function sendQuizInvitation(quizId, groupEmail, templateType) {
  const quizDetails = getQuizDetails(quizId);
  if (!quizDetails) throw new Error("Quiz not found.");

  const settings = JSON.parse(quizDetails.settings || '{}');
  
  // 1. Format the dynamic variables
  const passingRate = settings.passingRate ? settings.passingRate + '%' : 'None';
  let deadline = "No strict deadline";
  if (settings.endDate) {
    deadline = new Date(settings.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  // 2. Generate the shareable link for this specific quiz
  const appUrl = ScriptApp.getService().getUrl();
  const shareLink = appUrl + "?quizId=" + quizId;

  let subject = "";
  let htmlBody = "";

  // 3. Build the requested HTML Email Template
  if (templateType === "monthly") {
    subject = `Action Required: Your ${quizDetails.title} is here!`;
    htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #1a73e8; margin-bottom: 20px;">Hey Team,</h2>
        
        <p style="font-size: 16px; line-height: 1.5;">It’s that time again—your <strong>${quizDetails.title}</strong> is here!</p>
        <p style="font-size: 16px; line-height: 1.5;">This assessment is required for Pod Leads, SMEs, and Operators and is a key part of your stack ranking. Let’s make sure we’re all on track to perform at our best!</p>
        
        <h3 style="color: #5f6368; margin-top: 30px;">Why take the PKT?</h3>
        <ul style="font-size: 15px; line-height: 1.6; color: #3c4043;">
          <li>It’s <strong>essential</strong> for your stack ranking!</li>
          <li>It helps you <strong>show your skills</strong> and <strong>move up the ranks!</strong></li>
          <li>Plus, it’s a fun way to <strong>stay sharp</strong> and <strong>learn!</strong></li>
        </ul>
        
        <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #1a73e8; margin: 30px 0;">
          <p style="margin: 0 0 12px 0; font-size: 16px;">📅 <strong>Deadline:</strong> <span style="color: #d93025; font-weight: bold;">${deadline}</span></p>
          <p style="margin: 0 0 12px 0; font-size: 16px;">🎯 <strong>Passing Rate:</strong> ${passingRate}</p>
          <p style="margin: 0; font-size: 16px;">🔗 <strong>Take the Test:</strong> <a href="${shareLink}" style="color: #1a73e8; font-weight: bold; text-decoration: none;">Click here to begin</a></p>
        </div>
        
        <p style="color: #777; font-size: 14px; margin-top: 40px; border-top: 1px solid #e8eaed; padding-top: 20px;">Please ensure you complete this prior to the deadline. Good luck!</p>
      </div>
    `;
  } else {
    // SIMPLE PKT TEMPLATE
    subject = `Action Required: Please complete ${quizDetails.title}`;
    htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #1a73e8; margin-bottom: 20px;">Hello,</h2>
        
        <p style="font-size: 16px; line-height: 1.5;">Please take a moment to complete the following assessment: <strong>${quizDetails.title}</strong>.</p>
        
        <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; border-left: 4px solid #1a73e8; margin: 30px 0;">
          <p style="margin: 0 0 12px 0; font-size: 16px;">📅 <strong>Deadline:</strong> <span style="color: #d93025; font-weight: bold;">${deadline}</span></p>
          <p style="margin: 0 0 12px 0; font-size: 16px;">🎯 <strong>Passing Rate:</strong> ${passingRate}</p>
          <p style="margin: 0; font-size: 16px;">🔗 <strong>Take the Test:</strong> <a href="${shareLink}" style="color: #1a73e8; font-weight: bold; text-decoration: none;">Click here to begin</a></p>
        </div>
        
        <p style="color: #777; font-size: 14px; margin-top: 40px; border-top: 1px solid #e8eaed; padding-top: 20px;">Thank you.</p>
      </div>
    `;
  }

  try {
    MailApp.sendEmail({
      to: groupEmail,
      subject: subject,
      htmlBody: htmlBody
    });
    return true;
  } catch(e) {
    throw new Error("Failed to send: " + e.message);
  }
}

// --- SECURITY: ADMIN ACCESS CONTROL ---
function checkAdminStatus() {
  const email = Session.getActiveUser().getEmail();
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName('Admins');
  
  // If the sheet doesn't exist, we carefully create it
  if (!sheet) {
    try {
      sheet = spreadsheet.insertSheet('Admins');
      sheet.appendRow(['Admin Email', 'Added By', 'Date Added']);
      sheet.getRange("A1:C1").setFontWeight("bold");
      sheet.appendRow([email, 'System Auto-Setup', new Date()]);
      SpreadsheetApp.flush(); // Force the database to save immediately
    } catch(e) {
      // If it crashes, it means another process beat us to it by a millisecond!
      // We just ignore the crash and grab the sheet they created.
      sheet = spreadsheet.getSheetByName('Admins');
    }
    return true; 
  }
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === email.toLowerCase()) return true;
  }
  return false;
}

function getAdminsList() {
  if (!checkAdminStatus()) return [];
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Admins');
  const data = sheet.getDataRange().getValues();
  let admins = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) admins.push(String(data[i][0]).trim());
  }
  return admins;
}

function addNewAdmin(newEmail) {
  if (!checkAdminStatus()) throw new Error("Unauthorized");
  const myEmail = Session.getActiveUser().getEmail();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Admins');
  sheet.appendRow([newEmail.trim(), myEmail, new Date()]);
  return true;
}

function removeAdmin(targetEmail) {
  if (!checkAdminStatus()) throw new Error("Unauthorized");
  const myEmail = Session.getActiveUser().getEmail();
  if (targetEmail.toLowerCase() === myEmail.toLowerCase()) throw new Error("You cannot remove yourself.");
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Admins');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === targetEmail.toLowerCase()) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

// --- COLLABORATION: SAVE COLLABORATORS ---
function updateCollaborators(quizId, emailsString) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      sheet.getRange(i + 1, 7).setValue(emailsString); // Saves to Column G
      CacheService.getScriptCache().remove("quiz_v2_" + quizId);
      return true;
    }
  }
  return false;
}

// --- COLLABORATION: SAVE EDITED QUESTIONS ---
function updateQuizQuestions(quizId, questionsJson) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      sheet.getRange(i + 1, 4).setValue(questionsJson); // Overwrites Column D
      CacheService.getScriptCache().remove("quiz_v2_" + quizId);
      return true;
    }
  }
  return false;
}

// --- ADMIN/OWNER/COLLAB: DELETE SPECIFIC RESPONSE ---
function deleteResponseRow(quizId, email, dateStr) {
  const myEmail = Session.getActiveUser().getEmail().toLowerCase();
  const isAdmin = checkAdminStatus();
  
  // 1. Verify Ownership or Collaborator Status
  const quizSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  const quizData = quizSheet.getDataRange().getValues();
  let isAuthorized = isAdmin;
  
  for (let i = 1; i < quizData.length; i++) {
    if (quizData[i][0] === quizId) {
      const creator = String(quizData[i][5]).trim().toLowerCase();
      const collabs = String(quizData[i][6]).toLowerCase().split(',').map(e => e.trim());
      
      // Check if they are the creator OR if they are in the collabs list
      if (creator === myEmail || collabs.includes(myEmail)) isAuthorized = true;
      break;
    }
  }
  
  if (!isAuthorized) throw new Error("Access Denied: Only the quiz owner, collaborators, or an Admin can delete responses.");

  // 2. Execute Deletion
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Responses');
  const data = sheet.getDataRange().getValues();
  
  for (let i = data.length - 1; i >= 1; i--) { 
    if (data[i][0] === quizId && data[i][1] === email) {
      let sheetDateStr = new Date(data[i][4]).toString();
      let passedDateStr = new Date(dateStr).toString();
      
      if (sheetDateStr === passedDateStr) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
  }
  throw new Error("Response not found in the database.");
}

// --- ADMIN/OWNER/COLLAB: GRANT BONUS ATTEMPT (+1) ---
function grantBonusAttempt(quizId, email) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
  const data = sheet.getDataRange().getValues();
  const myEmail = Session.getActiveUser().getEmail().toLowerCase();
  
  // 1. Force the target email to lowercase to prevent mismatch errors
  const targetEmail = String(email).toLowerCase().trim();
  const isAdmin = checkAdminStatus();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      
      const creator = String(data[i][5]).trim().toLowerCase();
      const collabs = String(data[i][6]).toLowerCase().split(',').map(e => e.trim());
      
      if (!isAdmin && creator !== myEmail && !collabs.includes(myEmail)) {
        throw new Error("Access Denied: Only the quiz owner, collaborators, or an Admin can grant bonus attempts.");
      }
      
      let settings = JSON.parse(data[i][2] || '{}');
      if (!settings.exceptions) settings.exceptions = {};
      
      // 2. Grant the exception using the safe lowercase email
      settings.exceptions[targetEmail] = (settings.exceptions[targetEmail] || 0) + 1;
      
      sheet.getRange(i + 1, 3).setValue(JSON.stringify(settings)); 
      
      // 3. CRITICAL: Wipe the cache so the Taker's page updates instantly!
      CacheService.getScriptCache().remove("quiz_v2_" + quizId);
      CacheService.getScriptCache().remove(quizId); 
      
      return true;
    }
  }
  throw new Error("Quiz not found.");
}

// ==========================================
// --- EXPORT: CONVERT TO GOOGLE FORM ---
// ==========================================
function createGoogleForm(title, questionsJsonStr) {
  const questions = JSON.parse(questionsJsonStr || '[]');
  
  // 1. Create a brand new Google Form
  const form = FormApp.create(title + ' (Exported)');
  
  // 2. Set the form settings to be a graded Quiz
  form.setIsQuiz(true);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  
  // 3. Loop through your questions and add them to the Form
  questions.forEach(q => {
    let item;
    
    // Check if it should be checkboxes (multiple correct) or multiple choice (1 correct)
    if (q.type === 'checkbox') {
      item = form.addCheckboxItem();
    } else {
      item = form.addMultipleChoiceItem();
    }
    
    item.setTitle(q.question).setRequired(true);
    
    // Map the choices and set the correct answers for auto-grading
    const formChoices = q.options.map(opt => {
      return item.createChoice(opt.text, opt.isCorrect);
    });
    
    item.setChoices(formChoices);
    item.setPoints(1); // Default to 1 point per question
  });
  
  // Return the URL so the dashboard can instantly open it for the user
  return form.getEditUrl();
}

// ==========================================
// --- IMPORT: BULK GOOGLE FORMS RESPONSES ---
// ==========================================
function importBulkResponses(quizId, responsesArray) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Responses');
  const data = sheet.getDataRange().getValues();
  
  // 1. Build a memory bank of everyone who is already in the database for this quiz
  const existingRecords = new Set();
  
  // We start at i = 1 to skip the header row
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === quizId) {
      let existingEmail = String(data[i][1]).trim().toLowerCase();
      let existingTime = String(data[i][4]).trim();
      
      // Combine Email and Timestamp to create a unique "fingerprint" for each response
      existingRecords.add(existingEmail + "||" + existingTime);
    }
  }
  
  // 2. Filter the incoming CSV to ONLY include brand new responses
  let newRowsToAppend = [];
  
  responsesArray.forEach(r => {
    let incomingEmail = String(r.email).trim().toLowerCase();
    let incomingTime = String(r.date).trim();
    let fingerprint = incomingEmail + "||" + incomingTime;
    
    // If the database has NEVER seen this fingerprint before, prep it for upload!
    if (!existingRecords.has(fingerprint)) {
      newRowsToAppend.push([
        quizId, 
        incomingEmail, 
        r.answersJson, 
        r.score, 
        incomingTime
      ]);
    }
  });
  
  // 3. Inject only the new rows into the database
  if (newRowsToAppend.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRowsToAppend.length, 5).setValues(newRowsToAppend);
  }
  
  // Return the count of exactly how many NEW responses were added
  return newRowsToAppend.length;
}