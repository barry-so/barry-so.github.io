// ===========================
// Test.js for Station-Based Test
// ===========================

const form = document.getElementById("testForm");
const actionButton = document.getElementById("actionButton");
const timerEl = document.getElementById("timer");
const resultEl = document.getElementById("result");
const stationTitle = document.getElementById("stationTitle");

const STATION_TIME = 120; // 2 minutes per station

let currentStation = 0; // 0 = credentials, 1+ = actual stations
let totalStations = 0; // Will be determined dynamically
let timeLeft = STATION_TIME;
let timerInterval;
let userCredentials = { name: "", email: "" };
let isLoading = false;

// ---------------------------
// Load Credentials Form
// ---------------------------
function loadCredentialsForm() {
  stopTimer();
  stationTitle.textContent = "Enter Your Credentials";
  form.innerHTML = `
    <div class="credentials-section">
      <label>
        Name:
        <input type="text" id="nameInput" name="name" required>
      </label>
      <label>
        Email:
        <input type="email" id="emailInput" name="email" required>
      </label>
    </div>
  `;

  actionButton.textContent = "Begin Test";
  actionButton.disabled = true;

  const nameInput = document.getElementById("nameInput");
  const emailInput = document.getElementById("emailInput");

  function validateCredentials() {
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    actionButton.disabled = !(name && email);
  }

  nameInput.addEventListener("input", validateCredentials);
  emailInput.addEventListener("input", validateCredentials);
}

// ---------------------------
// Stop Timer
// ---------------------------
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerEl.textContent = "";
}

// ---------------------------
// Start Timer
// ---------------------------
function startTimer() {
  stopTimer();
  timeLeft = STATION_TIME;
  timerEl.textContent = `Time left: ${formatTime(timeLeft)}`;
  timerInterval = setInterval(() => {
    if (timeLeft > 0) {
      timeLeft--;
      timerEl.textContent = `Time left: ${formatTime(timeLeft)}`;
    }
    if (timeLeft <= 0) {
      stopTimer();
      timerEl.textContent = `Time left: ${formatTime(0)}`;
      handleNextStation(true);
    }
  }, 1000);
}

// ---------------------------
// Format Time (MM:SS)
// ---------------------------
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ---------------------------
// Show Loading Screen
// ---------------------------
function showLoading() {
  isLoading = true;
  actionButton.disabled = true;
  stopTimer();
  form.innerHTML = '<div class="loading">Loading questions...</div>';
}

// ---------------------------
// Count Total Stations
// ---------------------------
function countTotalStations() {
  const maxCheck = 20;
  const promises = [];
  
  for (let i = 1; i <= maxCheck; i++) {
    promises.push(
      fetch(`https://barry-proxy2.kimethan572.workers.dev?station=${i}`)
        .then(res => res.json())
        .then(data => ({ station: i, hasData: data && data.length > 0 }))
        .catch(() => ({ station: i, hasData: false }))
    );
  }
  
  return Promise.all(promises).then(results => {
    const stationsWithData = results.filter(r => r.hasData);
    return stationsWithData.length > 0 ? Math.max(...stationsWithData.map(r => r.station)) : 0;
  });
}

// ---------------------------
// Fetch Questions from Worker
// ---------------------------
function loadQuestions(stationNumber) {
  showLoading();
  
  fetch(`https://barry-proxy2.kimethan572.workers.dev?station=${stationNumber}`)
    .then(res => res.json())
    .then(data => {
      if (!data.length) {
        form.innerHTML = "<p>No questions found for this station.</p>";
        isLoading = false;
        return;
      }

      form.innerHTML = "";
      data.forEach((q, idx) => {
        const div = document.createElement("div");
        div.classList.add("question");

        if (q.options && q.options.length > 0) {
          // Multiple choice
          div.innerHTML = `<p>${q.question}</p>` +
            q.options.map(opt =>
              `<label><input type="radio" name="q${idx + 1}" value="${opt}"> ${opt}</label>`
            ).join("<br>");
        } else {
          // Open-ended
          div.innerHTML = `<p>${q.question}</p><input type="text" name="q${idx + 1}">`;
        }

        form.appendChild(div);
      });

      isLoading = false;
      
      // Update button state
      updateButtonState();
      actionButton.disabled = false;

      // Start timer after questions are fully loaded
      startTimer();
    })
    .catch(err => {
      form.innerHTML = `<p>Error loading questions: ${err}</p>`;
      isLoading = false;
      console.error(err);
    });
}

// ---------------------------
// Validate Form
// ---------------------------
function validateForm() {
  if (isLoading) {
    actionButton.disabled = true;
    return;
  }
  
  if (currentStation === 0) {
    const name = document.getElementById("nameInput")?.value.trim();
    const email = document.getElementById("emailInput")?.value.trim();
    actionButton.disabled = !(name && email);
  } else {
    // No validation required for stations - button is always enabled
    actionButton.disabled = false;
  }
}

// ---------------------------
// Update Button State
// ---------------------------
function updateButtonState() {
  if (currentStation === 0) {
    actionButton.textContent = "Begin Test";
  } else if (currentStation === totalStations) {
    actionButton.textContent = "Submit Test";
  } else {
    actionButton.textContent = "Next Station";
  }
}

// ---------------------------
// Handle Next Station
// ---------------------------
function handleNextStation(isAutoAdvance = false) {
  if (isLoading) return;
  
  stopTimer();
  resultEl.textContent = "";

  if (currentStation === 0) {
    // Save credentials
    userCredentials.name = document.getElementById("nameInput").value.trim();
    userCredentials.email = document.getElementById("emailInput").value.trim();
    
    // Count total stations first, then load first station
    countTotalStations().then(maxStation => {
      totalStations = maxStation;
      if (totalStations === 0) {
        resultEl.textContent = "No stations available.";
        return;
      }
      
      // Move to first actual station (timer will start when questions load)
      currentStation = 1;
      stationTitle.textContent = `Test Station ${currentStation}`;
      loadQuestions(currentStation);
      updateButtonState();
    });
  } else if (currentStation < totalStations) {
    // Show warning before moving to next station (only for manual clicks)
    if (!isAutoAdvance) {
      const confirmed = confirm("Moving onto next station means you cannot return. Continue?");
      if (!confirmed) {
        // Resume timer if user cancels
        startTimer();
        return;
      }
    }
    
    // Submit current station and move to next (timer will restart when questions load)
    submitStation(currentStation, false);
    currentStation++;
    stationTitle.textContent = `Test Station ${currentStation}`;
    loadQuestions(currentStation);
    updateButtonState();
  } else {
    // Final station - submit everything
    stopTimer();
    submitStation(currentStation, true);
  }
}

// ---------------------------
// Submit Station Answers
// ---------------------------
function submitStation(stationNumber, isFinal) {
  const data = new URLSearchParams();
  data.append("name", userCredentials.name);
  data.append("email", userCredentials.email);
  data.append("station", stationNumber.toString());

  new FormData(form).forEach((value, key) => data.append(key, value));

  fetch("https://barry-proxy2.kimethan572.workers.dev/", {
    method: "POST",
    body: data
  })
    .then(res => res.json())
    .then(result => {
      if (isFinal) {
        resultEl.textContent = "Test completed!";
        actionButton.disabled = true;
        actionButton.textContent = "Test Submitted";
        form.innerHTML = "";
      }
    })
    .catch(err => {
      resultEl.textContent = `Error submitting answers: ${err}`;
      console.error(err);
    });
}

// ---------------------------
// Action Button Event Listener
// ---------------------------
actionButton.addEventListener("click", () => {
  if (!actionButton.disabled) {
    handleNextStation();
  }
});

// ---------------------------
// Initialize
// ---------------------------
loadCredentialsForm();
