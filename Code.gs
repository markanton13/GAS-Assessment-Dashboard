function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.quizId = e.parameter.quizId || '';
  
  let pageTitle = 'PKT Dashboard'; // Default title for Creators/Admins
  
  // --- NEW: FETCH THE ACTUAL QUIZ TITLE ---
  if (e.parameter && e.parameter.quizId) {
    const quizId = e.parameter.quizId;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
    
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === quizId) {
          // Found the quiz! Grab the title from Column B (index 1)
          pageTitle = data[i][1] + ' | PKT Assessment';
          break;
        }
      }
    }
  }
  // ----------------------------------------
  
  return template.evaluate()
      .setTitle(pageTitle) // We pass the dynamic title here!
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 🪄 THE MAGIC FUNCTION: This injects your separate HTML/CSS/JS files into Index.html
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

// ==========================================
// --- MAGIC TOOL: ONE-CLICK FORM IMPORTER ---
// ==========================================
function autoImportGoogleForm(url) {
  try {
    const form = FormApp.openByUrl(url);
    const title = form.getTitle() || "Imported Google Form";
    const isQuiz = form.isQuiz();
    
    // 1. Extract the Questions and Answer Key
    const items = form.getItems();
    let questionsData = [];
    let itemIdMap = {}; // Maps Form Item ID to our new dashboard index
    let questionIndex = 0;
    let totalPoints = 0;
    
    items.forEach(item => {
      const type = item.getType();
      if (type === FormApp.ItemType.MULTIPLE_CHOICE || type === FormApp.ItemType.CHECKBOX) {
        let qItem = type === FormApp.ItemType.MULTIPLE_CHOICE ? item.asMultipleChoiceItem() : item.asCheckboxItem();
        let qType = type === FormApp.ItemType.MULTIPLE_CHOICE ? 'radio' : 'checkbox';
        
        let choices = qItem.getChoices();
        
        // This maps the options and asks Google if it was marked "Correct"
        let options = choices.map(c => ({
          text: c.getValue(),
          isCorrect: isQuiz ? c.isCorrectAnswer() : false 
        }));
        
        if (options.length > 0) {
          questionsData.push({
            question: qItem.getTitle(),
            type: qType,
            options: options
          });
          itemIdMap[item.getId()] = questionIndex;
          questionIndex++;
          totalPoints += (qItem.getPoints() || 0);
        }
      }
    });
    
    if (questionsData.length === 0) {
      throw new Error("No multiple choice or checkbox questions found to import!");
    }
    
    // 2. Create the "Shell" Quiz in your Database
    const quizId = Utilities.getUuid();
    const settings = { passingRate: 0, isImported: true }; // Analytics only
    
    const currentUser = Session.getActiveUser().getEmail() || "imported@system.com";
    const timestamp = new Date().toLocaleString(); // Grab the current date/time
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Quizzes');
    
    // FIX: Aligned perfectly with your database columns!
    // [Col A: ID, Col B: Title, Col C: Settings, Col D: Questions, Col E: Time, Col F: Owner, Col G: Collaborators]
    sheet.appendRow([quizId, title, JSON.stringify(settings), JSON.stringify(questionsData), timestamp, currentUser, ""]);
    
    // 3. Extract ALL historical responses
    const responses = form.getResponses();
    let responsesToAppend = [];
    
    responses.forEach(formResponse => {
      let email = formResponse.getRespondentEmail();
      if (!email || email === "") email = "anonymous@imported";
      
      let date = formResponse.getTimestamp().toString();
      
      // Calculate their final Score Percentage
      let scorePercent = "0%";
      if (isQuiz && totalPoints > 0) {
        let earned = 0;
        formResponse.getGradableItemResponses().forEach(r => {
           earned += (r.getScore() || 0);
        });
        scorePercent = Math.round((earned / totalPoints) * 100) + '%';
      } else {
        scorePercent = "N/A";
      }
      
      // Extract exactly what they clicked
      let answersJson = {};
      formResponse.getItemResponses().forEach(itemRes => {
        let qIdx = itemIdMap[itemRes.getItem().getId()];
        if (qIdx !== undefined) {
          let responseVal = itemRes.getResponse();
          if (!Array.isArray(responseVal)) responseVal = [responseVal];
          answersJson[`q_${qIdx}`] = responseVal;
        }
      });
      
      // FIX: Aligned perfectly with your database columns!
      // [Col A: Quiz ID, Col B: Responder, Col C: Answers, Col D: Score, Col E: Time Attempted]
      responsesToAppend.push([quizId, email, JSON.stringify(answersJson), scorePercent, date]);
    });
    
    // 4. Inject all responses into the database at lightning speed
    if (responsesToAppend.length > 0) {
      const respSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Responses');
      const startRow = respSheet.getLastRow() + 1;
      respSheet.getRange(startRow, 1, responsesToAppend.length, 5).setValues(responsesToAppend);
    }
    
    return quizId;
  } catch(error) {
    throw new Error(error.message);
  }
}