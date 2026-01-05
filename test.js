// ===========================
// Test.js for Station-Based Test
// ===========================

const form = document.getElementById("testForm");
const actionButton = document.getElementById("actionButton");
const timerEl = document.getElementById("timer");
const resultEl = document.getElementById("result");
const stationTitle = document.getElementById("stationTitle");
const questionNav = document.getElementById("questionNav");
const questionNavGrid = document.getElementById("questionNavGrid");
const navStatsTotal = document.getElementById("navStatsTotal");
const navStatsAnswered = document.getElementById("navStatsAnswered");
const navStatsSkipped = document.getElementById("navStatsSkipped");
const navStatsMarked = document.getElementById("navStatsMarked");

const STATION_TIME = 120;

let currentStation = 0;
let totalStations = 0;
let timeLeft = STATION_TIME;
let timerInterval;
let userCredentials = { name: "", email: "", test: "" };
let isLoading = false;
let currentQuestions = [];
let questionStates = {}; // Track answered, skipped, marked states
let currentQuestionNum = 1; // Track which question user is currently viewing
let lastAnsweredQuestion = 0; // Track the last question that was answered
let scrollObserver = null; // Intersection Observer for scroll tracking
let userIP = null; // User's IP address for state tracking
let timerStartTime = null; // When the timer started (for persistence)
let savedAnswers = {}; // Saved answers by station
let totalOutOfBrowserTime = 0; // Total time spent out of browser (in seconds)
let lastPageLeaveTime = null; // When user last left the page

// Loading screen themes
const loadingThemes = ['barry-theme', 'bird-theme', 'lizard-theme', 'bug-theme', 'fossil-theme', 'rock-theme'];

// ---------------------------
// Load Test List
// ---------------------------
function loadTestList() {
  const testSelect = document.getElementById("testSelect");
  if (!testSelect) return;
  
  fetch("https://barry-proxy2.kimethan572.workers.dev?action=listTests")
    .then(res => res.json())
    .then(tests => {
      testSelect.innerHTML = "";
      if (tests.length === 0) {
        testSelect.innerHTML = '<option value="">No tests available</option>';
        return;
      }
      tests.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        testSelect.appendChild(opt);
      });
    })
    .catch(err => {
      testSelect.innerHTML = '<option value="">Error loading tests</option>';
      console.error(err);
    });
}

// ---------------------------
// Load Credentials Form
// ---------------------------
function loadCredentialsForm() {
  stopTimer();
  questionNav.style.display = "none";
  stationTitle.textContent = "Enter Your Details (will be used on leaderboard)";
  form.innerHTML = `
    <div class="card credentials-section">
      <label class="block mb-4">
        <span class="font-semibold mb-2 block">Test:</span>
        <select id="testSelect" name="test" required class="w-full p-3 border rounded">
          <option value="">Loading tests...</option>
        </select>
      </label>
      <label class="block mb-4">
        <span class="font-semibold mb-2 block">Name:</span>
        <input type="text" id="nameInput" name="name" required class="w-full p-3 border rounded">
      </label>
      <label class="block mb-4">
        <span class="font-semibold mb-2 block">Email:</span>
        <input type="email" id="emailInput" name="email" required class="w-full p-3 border rounded">
      </label>
    </div>
  `;

  actionButton.textContent = "Begin Test";
  actionButton.disabled = true;
  actionButton.classList.add("bg-primary", "text-inverse", "px-6", "py-3", "rounded", "font-semibold");
  actionButton.classList.remove("card-interactive");

  const testSelect = document.getElementById("testSelect");
  const nameInput = document.getElementById("nameInput");
  const emailInput = document.getElementById("emailInput");

  function validateCredentials() {
    const test = testSelect.value;
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    actionButton.disabled = !(test && name && email);
  }

  testSelect.addEventListener("change", validateCredentials);
  nameInput.addEventListener("input", validateCredentials);
  emailInput.addEventListener("input", validateCredentials);
  
  loadTestList();
}

// ---------------------------
// Stop Timer
// ---------------------------
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  // Keep timer visible even when stopped
  if (currentStation > 0) {
    timerEl.className = "timer-display-inline";
  } else {
    timerEl.textContent = "";
    timerEl.className = "text-center mb-6";
  }
}

// ---------------------------
// Get User IP Address
// ---------------------------
async function getUserIP() {
  if (userIP) return userIP;
  
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    userIP = data.ip;
    return userIP;
  } catch (err) {
    // Fallback: use a session-based identifier
    if (!userIP) {
      userIP = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    return userIP;
  }
}

// ---------------------------
// Get State Key
// ---------------------------
function getStateKey() {
  if (!userIP || !userCredentials.test) return null;
  return `test_state_${userIP}_${userCredentials.test}`;
}

// ---------------------------
// Save Test State
// ---------------------------
function saveTestState() {
  const stateKey = getStateKey();
  if (!stateKey) return;
  
  const state = {
    currentStation: currentStation,
    totalStations: totalStations,
    timeLeft: timeLeft,
    timerStartTime: timerStartTime,
    userCredentials: userCredentials,
    questionStates: questionStates,
    currentQuestionNum: currentQuestionNum,
    lastAnsweredQuestion: lastAnsweredQuestion,
    savedAnswers: savedAnswers,
    totalOutOfBrowserTime: totalOutOfBrowserTime,
    lastPageLeaveTime: lastPageLeaveTime,
    timestamp: Date.now()
  };
  
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

// ---------------------------
// Load Test State
// ---------------------------
function loadTestState() {
  const stateKey = getStateKey();
  if (!stateKey) return null;
  
  try {
    const saved = localStorage.getItem(stateKey);
    if (!saved) return null;
    
    const state = JSON.parse(saved);
    
    // Check if state is too old (more than 24 hours)
    const hoursSinceSave = (Date.now() - state.timestamp) / (1000 * 60 * 60);
    if (hoursSinceSave > 24) {
      localStorage.removeItem(stateKey);
      return null;
    }
    
    return state;
  } catch (err) {
    console.error('Failed to load state:', err);
    return null;
  }
}

// ---------------------------
// Clear Test State
// ---------------------------
function clearTestState() {
  const stateKey = getStateKey();
  if (stateKey) {
    localStorage.removeItem(stateKey);
  }
}

// ---------------------------
// Check if Timer Expired
// ---------------------------
function checkTimerExpired() {
  if (!timerStartTime) return false;
  
  const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
  const remaining = STATION_TIME - elapsed;
  return remaining <= 0;
}

// ---------------------------
// Calculate Out of Browser Time
// ---------------------------
function calculateOutOfBrowserTime() {
  if (!lastPageLeaveTime) return 0;
  
  const timeAway = Math.floor((Date.now() - lastPageLeaveTime) / 1000);
  return timeAway;
}

// ---------------------------
// Update Out of Browser Time Display
// ---------------------------
function updateOutOfBrowserTimeDisplay() {
  const outOfBrowserEl = document.getElementById('outOfBrowserTime');
  if (!outOfBrowserEl) return;
  
  if (totalOutOfBrowserTime > 0 && currentStation > 0) {
    const mins = Math.floor(totalOutOfBrowserTime / 60);
    const secs = totalOutOfBrowserTime % 60;
    const timeString = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    
    outOfBrowserEl.style.display = "block";
    outOfBrowserEl.innerHTML = `
      <div class="out-of-browser-time-content">
        <span class="out-of-browser-label">Time Away:</span>
        <span class="out-of-browser-value">${timeString}</span>
      </div>
    `;
  } else {
    outOfBrowserEl.style.display = "none";
  }
}

// ---------------------------
// Format Time for Display
// ---------------------------
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  }
  return `${mins}:${secs.toString().padStart(2,'0')}`;
}

// ---------------------------
// Show Time Expired Message
// ---------------------------
function showTimeExpiredMessage() {
  resultEl.className = "text-center mt-6 mb-6";
  resultEl.innerHTML = `
    <div class="card" style="background-color: var(--error-50); border: 2px solid var(--color-error);">
      <div class="text-center">
        <div class="text-4xl mb-4">⏱️</div>
        <h3 class="text-error mb-3" style="font-size: var(--font-size-xl); font-weight: var(--font-weight-bold);">
          Time Expired
        </h3>
        <p class="text-base mb-2" style="color: var(--color-text-primary);">
          The time limit for this station has expired.
        </p>
        <p class="text-sm mb-4" style="color: var(--color-text-secondary);">
          You are being automatically moved to the next station.
        </p>
      </div>
    </div>
  `;
  
  // Auto-hide message after 5 seconds
  setTimeout(() => {
    resultEl.textContent = "";
    resultEl.className = "text-center mt-6";
  }, 5000);
}

// ---------------------------
// Start Timer
// ---------------------------
function startTimer(restoreTime = false) {
  stopTimer();
  
  // Restore timer from saved state if available, otherwise reset to 2:00
  if (restoreTime && timerStartTime) {
    const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
    timeLeft = Math.max(0, STATION_TIME - elapsed);
    
    // If time has expired while away, auto-advance with message
    if (timeLeft <= 0) {
      showTimeExpiredMessage();
      // Small delay to show message before advancing
      setTimeout(() => {
        handleNextStation(true);
      }, 1000);
      return;
    }
  } else {
    // New station - reset to 2:00
    timeLeft = STATION_TIME;
    timerStartTime = Date.now();
  }
  
  updateTimerDisplay();
  timerEl.className = "timer-display-inline";
  timerEl.style.display = "block";
  
  // Save timer start time
  saveTestState();
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    // Save state every 10 seconds to persist timer
    if (timeLeft % 10 === 0) {
      saveTestState();
    }
    
    // Visual warning when time is running low
    if (timeLeft <= 10 && timeLeft > 0) {
      timerEl.classList.add("timer-warning");
      timerEl.classList.remove("timer-normal");
    } else if (timeLeft > 10) {
      timerEl.classList.add("timer-normal");
      timerEl.classList.remove("timer-warning");
    }
    
    // Auto-advance when timer reaches 0
    if (timeLeft <= 0) {
      stopTimer();
      // Automatically move to next station, even if not filled out
      handleNextStation(true);
    }
  }, 1000);
  
  // Update out of browser time display when timer starts
  updateOutOfBrowserTimeDisplay();
}

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeString = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  timerEl.innerHTML = `<span class="timer-label">Time Remaining:</span><span class="timer-value">${timeString}</span>`;
  timerEl.setAttribute('aria-label', `Time remaining: ${mins} minutes and ${secs} seconds`);
  timerEl.setAttribute('aria-atomic', 'true');
  timerEl.setAttribute('aria-live', 'polite');
}

// ---------------------------
// Show Loading Screen
// ---------------------------
function showLoading(theme = null) {
  isLoading = true;
  actionButton.disabled = true;
  stopTimer();
  
  const selectedTheme = theme || loadingThemes[Math.floor(Math.random() * loadingThemes.length)];
  const loadingHTML = getLoadingScreenHTML(selectedTheme);
  form.innerHTML = `<div class="loading-screen ${selectedTheme}">${loadingHTML}</div>`;
}

function getLoadingScreenHTML(theme) {
  if (theme === 'barry-theme') {
    return `
      <div class="loading-barry">
        <div class="barry-bee">
          <div class="barry-body">
            <div class="barry-stripe"></div>
            <div class="barry-stripe"></div>
            <div class="barry-stripe"></div>
          </div>
          <div class="barry-head"></div>
          <div class="barry-wing left"></div>
          <div class="barry-wing right"></div>
        </div>
        <div class="barry-trail">
          <div class="barry-dot"></div>
          <div class="barry-dot"></div>
          <div class="barry-dot"></div>
          <div class="barry-dot"></div>
          <div class="barry-dot"></div>
        </div>
      </div>
      <div class="loading-message">Loading questions...</div>
    `;
  } else if (theme === 'bird-theme') {
    return `
      <div class="loading-bird">
        <div class="bird">
          <div class="bird-body">
            <div class="bird-head"></div>
            <div class="bird-beak"></div>
            <div class="bird-wing"></div>
            <div class="bird-tail"></div>
          </div>
        </div>
      </div>
      <div class="loading-message">Loading questions...</div>
    `;
  } else if (theme === 'lizard-theme') {
    return `
      <div class="loading-lizard">
        <div class="lizard">
          <div class="lizard-body">
            <div class="lizard-head">
              <div class="lizard-eye"></div>
            </div>
            <div class="lizard-leg front-left"></div>
            <div class="lizard-leg front-right"></div>
            <div class="lizard-leg back-left"></div>
            <div class="lizard-leg back-right"></div>
            <div class="lizard-tail"></div>
          </div>
        </div>
      </div>
      <div class="loading-message">Loading questions...</div>
    `;
  } else {
    return `<div class="loading-message">Loading questions...</div>`;
  }
}

// ---------------------------
// Count Stations
// ---------------------------
function countTotalStations() {
  const maxCheck = 20;
  const promises = [];

  for (let i = 1; i <= maxCheck; i++) {
    promises.push(
      fetch(`https://barry-proxy2.kimethan572.workers.dev?test=${userCredentials.test}&station=${i}`)
        .then(res => res.json())
        .then(data => ({ station: i, hasData: data.length > 0 }))
        .catch(() => ({ station: i, hasData: false }))
    );
  }

  return Promise.all(promises).then(results => {
    const valid = results.filter(r => r.hasData);
    return valid.length ? Math.max(...valid.map(r => r.station)) : 0;
  });
}

// ---------------------------
// Update Question Navigation
// ---------------------------
function updateQuestionNavigation() {
  if (!currentQuestions.length) {
    questionNav.style.display = "none";
    return;
  }

  questionNav.style.display = "block";
  questionNavGrid.innerHTML = "";

  const total = currentQuestions.length;
  let answered = 0;
  let marked = 0;
  let skipped = 0;

  currentQuestions.forEach((q, idx) => {
    const num = idx + 1;
    let state = questionStates[num] || 'default';
    
    // Handle combined states
    if (state.includes('-')) {
      const parts = state.split('-');
      if (parts.includes('answered')) answered++;
      if (parts.includes('marked')) marked++;
      if (parts.includes('skipped')) skipped++;
    } else {
      if (state === 'answered') answered++;
      if (state === 'marked') marked++;
      if (state === 'skipped') skipped++;
    }

    const navItem = document.createElement("button");
    // Use the base state for styling (answered takes precedence over skipped)
    const baseState = state.includes('answered') ? 'answered' : 
                     state.includes('skipped') ? 'skipped' : 
                     state.includes('marked') ? 'marked' : 'default';
    navItem.className = `question-nav-item state-${baseState}`;
    navItem.textContent = num;
    navItem.setAttribute('aria-label', `Question ${num}, ${state}`);
    navItem.setAttribute('data-question', num);
    
    // Mark current question
    if (num === currentQuestionNum) {
      navItem.classList.add('state-current');
    }

    navItem.addEventListener('click', () => {
      scrollToQuestion(num);
    });

    questionNavGrid.appendChild(navItem);
  });

  navStatsTotal.textContent = `Total: ${total}`;
  navStatsAnswered.textContent = `Answered: ${answered}`;
  navStatsSkipped.textContent = `Skipped: ${skipped}`;
  navStatsMarked.textContent = `Marked: ${marked}`;
}

// ---------------------------
// Create Bookmark Icon
// ---------------------------
function createBookmarkIcon(questionNum) {
  const bookmark = document.createElement("button");
  bookmark.className = "question-bookmark";
  bookmark.type = "button";
  bookmark.setAttribute('aria-label', `Mark question ${questionNum} for review`);
  bookmark.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  `;
  
  bookmark.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleQuestionMarked(questionNum);
  });
  
  return bookmark;
}

// ---------------------------
// Toggle Question Marked State
// ---------------------------
function toggleQuestionMarked(questionNum) {
  const currentState = questionStates[questionNum] || 'default';
  const bookmark = document.querySelector(`#question-${questionNum} .question-bookmark`);
  
  if (currentState.includes('marked')) {
    // Remove marked state
    if (currentState === 'marked') {
      questionStates[questionNum] = 'default';
    } else if (currentState === 'answered-marked') {
      questionStates[questionNum] = 'answered';
    } else if (currentState === 'skipped-marked') {
      questionStates[questionNum] = 'skipped';
    } else if (currentState === 'answered-skipped-marked') {
      questionStates[questionNum] = 'answered-skipped';
    }
    bookmark?.classList.remove('marked');
    bookmark?.setAttribute('aria-label', `Mark question ${questionNum} for review`);
  } else {
    // Add marked state
    if (currentState === 'default') {
      questionStates[questionNum] = 'marked';
    } else if (currentState === 'answered') {
      questionStates[questionNum] = 'answered-marked';
    } else if (currentState === 'skipped') {
      questionStates[questionNum] = 'skipped-marked';
    } else if (currentState === 'answered-skipped') {
      questionStates[questionNum] = 'answered-skipped-marked';
    }
    bookmark?.classList.add('marked');
    bookmark?.setAttribute('aria-label', `Unmark question ${questionNum}`);
  }
  
  updateQuestionNavigation();
}

// ---------------------------
// Detect Skipped Questions
// ---------------------------
function detectSkippedQuestions(newQuestionNum) {
  // If user moves to a question after the last answered question, mark skipped
  if (newQuestionNum > lastAnsweredQuestion + 1) {
    for (let i = lastAnsweredQuestion + 1; i < newQuestionNum; i++) {
      const state = questionStates[i] || 'default';
      // Only mark as skipped if not already answered or marked
      if (state === 'default' || state === 'marked') {
        if (state === 'default') {
          questionStates[i] = 'skipped';
        } else if (state === 'marked') {
          questionStates[i] = 'skipped-marked';
        }
      }
    }
    updateQuestionNavigation();
  }
}

// ---------------------------
// Track Scroll Position
// ---------------------------
function setupScrollTracking() {
  // Clean up existing observer
  if (scrollObserver) {
    scrollObserver.disconnect();
  }

  const questions = form.querySelectorAll('.question');
  if (questions.length === 0) return;

  // Options for Intersection Observer
  const options = {
    root: null,
    rootMargin: '-20% 0px -60% 0px', // Trigger when question is in upper 40% of viewport
    threshold: 0
  };

  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const questionNum = parseInt(entry.target.getAttribute('data-question-number'));
        if (questionNum && questionNum !== currentQuestionNum) {
          const oldNum = currentQuestionNum;
          currentQuestionNum = questionNum;
          
          // Detect skipped questions
          detectSkippedQuestions(questionNum);
          
          // Update current question highlight
          updateCurrentQuestionHighlight(oldNum, questionNum);
          updateQuestionNavigation();
        }
      }
    });
  }, options);

  // Observe all questions
  questions.forEach(question => {
    scrollObserver.observe(question);
  });
}

// ---------------------------
// Update Current Question Highlight
// ---------------------------
function updateCurrentQuestionHighlight(oldNum, newNum) {
  const oldQuestion = form.querySelector(`#question-${oldNum}`);
  const newQuestion = form.querySelector(`#question-${newNum}`);
  
  if (oldQuestion) {
    oldQuestion.classList.remove('current-question');
  }
  if (newQuestion) {
    newQuestion.classList.add('current-question');
  }
}

function scrollToQuestion(num) {
  const questionDiv = form.querySelector(`#question-${num}`);
  if (questionDiv) {
    questionDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Update current question
    const oldNum = currentQuestionNum;
    currentQuestionNum = num;
    updateCurrentQuestionHighlight(oldNum, num);
    
    // Detect skipped questions when manually navigating
    detectSkippedQuestions(num);
    
    // Update navigation
    updateQuestionNavigation();
  }
}

// ---------------------------
// Save Answer
// ---------------------------
function saveAnswer(questionName, value) {
  if (!savedAnswers[currentStation]) {
    savedAnswers[currentStation] = {};
  }
  savedAnswers[currentStation][questionName] = value;
  saveTestState();
}

// ---------------------------
// Restore Answers
// ---------------------------
function restoreAnswers() {
  if (!savedAnswers[currentStation]) return;
  
  const answers = savedAnswers[currentStation];
  Object.keys(answers).forEach(questionName => {
    const input = form.querySelector(`[name="${questionName}"]`);
    if (input) {
      if (input.type === 'radio') {
        const radio = form.querySelector(`[name="${questionName}"][value="${answers[questionName]}"]`);
        if (radio) {
          radio.checked = true;
          // Trigger change event to update state
          radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (input.type === 'text') {
        input.value = answers[questionName];
        // Trigger input event to update state
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });
}

// ---------------------------
// Track Question States
// ---------------------------
function trackQuestionStates() {
  currentQuestions.forEach((q, idx) => {
    const num = idx + 1;
    const questionDiv = form.querySelector(`#question-${num}`);
    if (!questionDiv) return;

    // Check for radio buttons
    const radioInputs = questionDiv.querySelectorAll('input[type="radio"]');
    if (radioInputs.length) {
      radioInputs.forEach(radio => {
        radio.addEventListener('change', () => {
          const currentState = questionStates[num] || 'default';
          if (currentState.includes('marked')) {
            questionStates[num] = 'answered-marked';
          } else if (currentState.includes('skipped')) {
            questionStates[num] = 'answered-skipped';
            if (currentState.includes('marked')) {
              questionStates[num] = 'answered-skipped-marked';
            }
          } else {
            questionStates[num] = 'answered';
          }
          
          // Save answer
          saveAnswer(`q${num}`, radio.value);
          
          // Update last answered question
          if (num > lastAnsweredQuestion) {
            lastAnsweredQuestion = num;
          }
          
          updateQuestionNavigation();
        });
      });
    }

    // Check for text input
    const textInput = questionDiv.querySelector('input[type="text"]');
    if (textInput) {
      textInput.addEventListener('input', () => {
        const currentState = questionStates[num] || 'default';
        if (textInput.value.trim()) {
          if (currentState.includes('marked')) {
            questionStates[num] = 'answered-marked';
          } else if (currentState.includes('skipped')) {
            questionStates[num] = 'answered-skipped';
            if (currentState.includes('marked')) {
              questionStates[num] = 'answered-skipped-marked';
            }
          } else {
            questionStates[num] = 'answered';
          }
          
          // Save answer
          saveAnswer(`q${num}`, textInput.value);
          
          // Update last answered question
          if (num > lastAnsweredQuestion) {
            lastAnsweredQuestion = num;
          }
        } else {
          // Remove answered state but keep marked/skipped
          if (currentState === 'answered') {
            questionStates[num] = 'default';
          } else if (currentState === 'answered-marked') {
            questionStates[num] = 'marked';
          } else if (currentState === 'answered-skipped') {
            questionStates[num] = 'skipped';
          } else if (currentState === 'answered-skipped-marked') {
            questionStates[num] = 'skipped-marked';
          }
          
          // Remove saved answer
          if (savedAnswers[currentStation] && savedAnswers[currentStation][`q${num}`]) {
            delete savedAnswers[currentStation][`q${num}`];
            saveTestState();
          }
        }
        updateQuestionNavigation();
      });
    }
  });
}

// ---------------------------
// Load Questions
// ---------------------------
function loadQuestions(stationNumber) {
  showLoading();

  fetch(`https://barry-proxy2.kimethan572.workers.dev?test=${userCredentials.test}&station=${stationNumber}`)
    .then(res => res.json())
    .then(data => {
      if (!data.length) {
        form.innerHTML = '<div class="card"><p class="text-center">No questions found for this station.</p></div>';
        isLoading = false;
        questionNav.style.display = "none";
        return;
      }

      currentQuestions = data;
      
      // Restore question states from saved state if available
      const questionSavedState = loadTestState();
      if (questionSavedState && questionSavedState.currentStation === stationNumber) {
        questionStates = questionSavedState.questionStates || {};
        currentQuestionNum = questionSavedState.currentQuestionNum || 1;
        lastAnsweredQuestion = questionSavedState.lastAnsweredQuestion || 0;
        savedAnswers = questionSavedState.savedAnswers || {};
        totalOutOfBrowserTime = questionSavedState.totalOutOfBrowserTime || 0;
        if (questionSavedState.timerStartTime) {
          timerStartTime = questionSavedState.timerStartTime;
        }
        
        // Calculate out of browser time if user was away
        if (questionSavedState.lastPageLeaveTime) {
          const timeAway = Math.floor((Date.now() - questionSavedState.lastPageLeaveTime) / 1000);
          if (timeAway > 0) {
            totalOutOfBrowserTime += timeAway;
            lastPageLeaveTime = null; // Reset after calculating
            saveTestState();
          }
        }
      } else {
        questionStates = {};
        currentQuestionNum = 1;
        lastAnsweredQuestion = 0;
        savedAnswers[currentStation] = savedAnswers[currentStation] || {};
        timerStartTime = null; // Reset timer for new station
      }
      
      form.innerHTML = "";

      data.forEach((q, idx) => {
        const num = idx + 1;
        const div = document.createElement("div");
        div.classList.add("question");
        if (num === 1) {
          div.classList.add("current-question");
        }
        div.id = `question-${num}`;
        div.setAttribute('data-question-number', num);

        if (q.options.length) {
          div.innerHTML = `<p>${q.question}</p>` + q.options.map(opt =>
            `<label><input type="radio" name="q${num}" value="${opt}"> ${opt}</label>`
          ).join("");
        } else {
          div.innerHTML = `<p>${q.question}</p><input type="text" name="q${num}" placeholder="Enter your answer">`;
        }

        // Add bookmark icon
        const bookmark = createBookmarkIcon(num);
        div.appendChild(bookmark);

        form.appendChild(div);
      });

      trackQuestionStates();
      
      // Restore saved answers
      restoreAnswers();
      
      setupScrollTracking();
      updateQuestionNavigation();
      isLoading = false;
      actionButton.disabled = false;
      actionButton.classList.remove("bg-primary", "text-inverse");
      actionButton.classList.add("card-interactive", "bg-primary", "text-inverse");
      updateButtonState();
      
      // Update out of browser time display
      updateOutOfBrowserTimeDisplay();
      
      // Start timer - restore from saved state or reset to 2:00
      const stationSavedState = loadTestState();
      const shouldRestore = stationSavedState && stationSavedState.currentStation === currentStation && stationSavedState.timerStartTime;
      if (shouldRestore && stationSavedState.timerStartTime) {
        timerStartTime = stationSavedState.timerStartTime;
        
        // Check if timer expired while away
        if (checkTimerExpired()) {
          // Timer expired - show message and auto-advance
          showTimeExpiredMessage();
          
          // Small delay to show message before advancing
          setTimeout(() => {
            if (currentStation < totalStations) {
              submitStation(currentStation, false);
              currentStation++;
              stationTitle.textContent = `Test Station ${currentStation} of ${totalStations}`;
              timerStartTime = null; // Reset for new station
              loadQuestions(currentStation);
              updateButtonState();
            } else {
              // Last station - submit final
              submitStation(currentStation, true);
            }
          }, 1500);
          return; // Don't start timer, we're advancing
        }
      }
      startTimer(shouldRestore);
      
      // Ensure button is visible
      ensureButtonVisible();
    })
    .catch(err => {
      form.innerHTML = `<div class="card"><p class="text-error text-center">Error loading questions: ${err.message}</p></div>`;
      isLoading = false;
      questionNav.style.display = "none";
    });
}

// ---------------------------
// UI State
// ---------------------------
function updateButtonState() {
  if (currentStation === 0) {
    actionButton.textContent = "Begin Test";
  } else if (currentStation === totalStations) {
    actionButton.textContent = "Submit Test";
  } else {
    actionButton.textContent = "Next Station";
  }
  
  // Ensure button is visible when state changes
  if (!actionButton.disabled) {
    ensureButtonVisible();
  }
}

// ---------------------------
// Ensure Button is Visible
// ---------------------------
function ensureButtonVisible() {
  const buttonContainer = document.getElementById('actionButtonContainer');
  if (buttonContainer && actionButton) {
    // Check if button is in viewport
    const rect = buttonContainer.getBoundingClientRect();
    const isVisible = (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
    
    // If not visible, scroll to it
    if (!isVisible) {
      setTimeout(() => {
        buttonContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }
}

// ---------------------------
// Flow Control
// ---------------------------
async function handleNextStation(isAutoAdvance=false) {
  if (isLoading) return;

  stopTimer();
  resultEl.textContent = "";
  
  // Save current state before moving
  if (currentStation > 0) {
    saveTestState();
  }

  if (currentStation === 0) {
    userCredentials.name = document.getElementById("nameInput").value.trim();
    userCredentials.email = document.getElementById("emailInput").value.trim();
    userCredentials.test = document.getElementById("testSelect").value;
    
    // Get IP if not already set
    await getUserIP();
    
    // Check for existing state for this test
    const savedState = loadTestState();
    if (savedState && savedState.userCredentials.test === userCredentials.test) {
      // Restore from saved state
      currentStation = savedState.currentStation || 1;
      totalStations = savedState.totalStations || 0;
      questionStates = savedState.questionStates || {};
      savedAnswers = savedState.savedAnswers || {};
      
      if (savedState.timerStartTime) {
        timerStartTime = savedState.timerStartTime;
      }
      
      // Re-count stations to ensure accuracy
      countTotalStations().then(max => {
        totalStations = max;
        if (!totalStations) {
          resultEl.textContent = "No stations available.";
          resultEl.className = "text-center mt-6 text-error";
          isLoading = false;
          actionButton.disabled = false;
          form.innerHTML = "";
          questionNav.style.display = "none";
          clearTestState();
          return;
        }
        
        // Ensure current station is valid
        if (currentStation > totalStations) {
          currentStation = totalStations;
        }
        
        stationTitle.textContent = `Test Station ${currentStation} of ${totalStations}`;
        loadQuestions(currentStation);
        updateButtonState();
      });
    } else {
      // New test - start fresh
      showLoading();

      countTotalStations().then(max => {
        totalStations = max;
        if (!totalStations) {
          resultEl.textContent = "No stations available.";
          resultEl.className = "text-center mt-6 text-error";
          isLoading = false;
          actionButton.disabled = false;
          form.innerHTML = "";
          questionNav.style.display = "none";
          return;
        }
        currentStation = 1;
        stationTitle.textContent = `Test Station ${currentStation} of ${totalStations}`;
        loadQuestions(currentStation);
        updateButtonState();
      });
    }

  } else if (currentStation < totalStations) {
    if (!isAutoAdvance && !confirm("Moving onto next station means you cannot return. Continue?")) {
      startTimer(); // Resume timer if user cancels
      return;
    }

    submitStation(currentStation, false);
    currentStation++;
    stationTitle.textContent = `Test Station ${currentStation} of ${totalStations}`;
    // Clear timer start time for new station - timer will reset to 2:00
    timerStartTime = null;
    // Timer will be reset to 2:00 in loadQuestions -> startTimer()
    loadQuestions(currentStation);
    updateButtonState();

  } else {
    // Final submission - show warning
    const warningMessage = `Are you sure you want to submit the test?\n\n` +
      `This will submit all your answers and you will not be able to make any changes.\n\n` +
      `Please review your answers before submitting.`;
    
    if (!confirm(warningMessage)) {
      startTimer();
      return;
    }
    
    submitStation(currentStation, true);
  }
}

// ---------------------------
// Show Completion Screen
// ---------------------------
function showCompletionScreen() {
  stopTimer();
  questionNav.style.display = "none";
  
  // Calculate final out of browser time if user was away
  if (lastPageLeaveTime) {
    const timeAway = calculateOutOfBrowserTime();
    if (timeAway > 0) {
      totalOutOfBrowserTime += timeAway;
    }
  }
  
  // Format total out of browser time
  const outOfBrowserTimeFormatted = formatTime(totalOutOfBrowserTime);
  
  // Clear saved state after completion
  clearTestState();
  
  form.innerHTML = `
    <div class="card completion-screen text-center">
      <div class="completion-icon text-5xl mb-4">✓</div>
      <h2 class="text-success mb-4">Test Completed!</h2>
      <p class="text-lg mb-3">Thank you for completing the test, <strong>${userCredentials.name}</strong>!</p>
      <p class="mb-3">Your responses have been submitted successfully.</p>
      ${totalOutOfBrowserTime > 0 ? `
        <div class="out-of-browser-summary mb-4">
          <p class="text-base mb-2" style="color: var(--color-text-secondary);">
            <strong>Total Time Away:</strong> <span style="color: var(--color-text-primary); font-weight: var(--font-weight-semibold);">${outOfBrowserTimeFormatted}</span>
          </p>
        </div>
      ` : ''}
      <p class="mb-4">Check the leaderboard to see your results and ranking.</p>
      <p class="text-sm text-secondary mt-6">
        Need help? Join our <a href="https://discord.gg/FrpjBr9gpv" target="_blank" rel="noopener noreferrer">Discord Server</a> or email us at <a href="mailto:kimethan572@gmail.com">kimethan572@gmail.com</a>
      </p>
    </div>
  `;
  actionButton.style.display = "none";
  timerEl.textContent = "";
  stationTitle.textContent = "";
  resultEl.textContent = "";
  
  // Hide out of browser time display
  const outOfBrowserEl = document.getElementById('outOfBrowserTime');
  if (outOfBrowserEl) {
    outOfBrowserEl.style.display = "none";
  }
}

// ---------------------------
// Submit
// ---------------------------
function submitStation(stationNumber, isFinal) {
  const data = new URLSearchParams();
  data.append("name", userCredentials.name);
  data.append("email", userCredentials.email);
  data.append("station", stationNumber);
  data.append("test", userCredentials.test);
  if (isFinal) data.append("final", "true");

  new FormData(form).forEach((v,k) => data.append(k,v));

  fetch("https://barry-proxy2.kimethan572.workers.dev/", { method: "POST", body: data })
    .then(res => res.json())
    .then(() => {
      if (isFinal) {
        showCompletionScreen();
      }
    })
    .catch(err => {
      if (isFinal) {
        resultEl.textContent = `Error submitting test: ${err}`;
        resultEl.className = "text-center mt-6 text-error";
        console.error(err);
      }
    });
}

// ---------------------------
// Keyboard Navigation
// ---------------------------
document.addEventListener('keydown', (e) => {
  // Detect keyboard vs mouse usage
  if (e.key === 'Tab') {
    document.body.classList.add('keyboard-user');
    document.body.classList.remove('mouse-user');
  }
});

document.addEventListener('mousedown', () => {
  document.body.classList.add('mouse-user');
  document.body.classList.remove('keyboard-user');
});

// ---------------------------
// Restore Test State on Page Load
// ---------------------------
async function initializeTestState() {
  // Get user IP first
  await getUserIP();
  
  // Check for saved state
  const savedState = loadTestState();
  if (savedState && savedState.userCredentials) {
    // Restore credentials
    userCredentials = savedState.userCredentials;
    currentStation = savedState.currentStation || 0;
    totalStations = savedState.totalStations || 0;
    questionStates = savedState.questionStates || {};
    currentQuestionNum = savedState.currentQuestionNum || 1;
    lastAnsweredQuestion = savedState.lastAnsweredQuestion || 0;
    savedAnswers = savedState.savedAnswers || {};
    totalOutOfBrowserTime = savedState.totalOutOfBrowserTime || 0;
    lastPageLeaveTime = savedState.lastPageLeaveTime || null;
    
    // Calculate out of browser time if user was away
    if (lastPageLeaveTime) {
      const timeAway = calculateOutOfBrowserTime();
      if (timeAway > 0) {
        totalOutOfBrowserTime += timeAway;
        lastPageLeaveTime = null; // Reset after calculating
        saveTestState();
      }
    }
    
    // Restore timer start time
    if (savedState.timerStartTime) {
      timerStartTime = savedState.timerStartTime;
      
      // Check if timer expired while user was away
      if (checkTimerExpired()) {
        // Timer expired - show message and auto-advance
        showTimeExpiredMessage();
        
        // Submit current station and move to next
        if (currentStation > 0 && currentStation <= totalStations) {
          // Small delay to show message
          setTimeout(() => {
            if (currentStation < totalStations) {
              submitStation(currentStation, false);
              currentStation++;
              stationTitle.textContent = `Test Station ${currentStation} of ${totalStations}`;
              timerStartTime = null; // Reset for new station
              loadQuestions(currentStation);
              updateButtonState();
            } else {
              // Last station - submit final
              submitStation(currentStation, true);
            }
          }, 1500);
        }
        return true; // State was restored but timer expired
      }
    }
    
    // If we're in the middle of a test, restore it
    if (currentStation > 0 && totalStations > 0) {
      stationTitle.textContent = `Test Station ${currentStation} of ${totalStations}`;
      updateOutOfBrowserTimeDisplay();
      loadQuestions(currentStation);
      updateButtonState();
      return true; // State restored
    }
  }
  
  return false; // No state to restore
}

// ---------------------------
// Save State Before Page Unload
// ---------------------------
window.addEventListener('beforeunload', (e) => {
  if (currentStation > 0) {
    // Save when user left the page
    lastPageLeaveTime = Date.now();
    
    // Calculate remaining time based on timer start
    if (timerStartTime) {
      const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
      timeLeft = Math.max(0, STATION_TIME - elapsed);
    }
    saveTestState();
  }
});

// Track page visibility to detect when user returns
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // User left - save leave time
    if (currentStation > 0) {
      lastPageLeaveTime = Date.now();
      saveTestState();
    }
  } else {
    // User returned - calculate out of browser time
    if (currentStation > 0 && lastPageLeaveTime) {
      const timeAway = calculateOutOfBrowserTime();
      if (timeAway > 0) {
        totalOutOfBrowserTime += timeAway;
        updateOutOfBrowserTimeDisplay();
        saveTestState();
      }
      lastPageLeaveTime = null; // Reset
    }
  }
});

// Save state periodically while test is active
setInterval(() => {
  if (currentStation > 0 && timerStartTime) {
    const elapsed = Math.floor((Date.now() - timerStartTime) / 1000);
    timeLeft = Math.max(0, STATION_TIME - elapsed);
    saveTestState();
  }
}, 5000); // Save every 5 seconds

// ---------------------------
// Init
// ---------------------------
(async () => {
  // Try to restore state first
  const stateRestored = await initializeTestState();
  
  if (!stateRestored) {
    // No saved state, load credentials form
    loadCredentialsForm();
  }
})();

actionButton.addEventListener("click", () => {
  if (!actionButton.disabled) handleNextStation();
});

// Enter key support for form submission
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !actionButton.disabled && document.activeElement.tagName !== 'TEXTAREA') {
    if (currentStation === 0 || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') {
      // Allow normal form behavior
      return;
    }
  }
});
