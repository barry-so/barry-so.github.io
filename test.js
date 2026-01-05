// ===========================
// Test.js for Station-Based Test
// ===========================

const form = document.getElementById("testForm");
const actionButton = document.getElementById("actionButton");
const timerEl = document.getElementById("timer");
const resultEl = document.getElementById("result");
const stationTitle = document.getElementById("stationTitle");
const testSelect = document.getElementById("testSelect");

const STATION_TIME = 120;

let currentStation = 0;
let totalStations = 0;
let timeLeft = STATION_TIME;
let timerInterval;
let userCredentials = { name: "", email: "", test: "" };
let isLoading = false;

// ---------------------------
// Load Test List
// ---------------------------
function loadTestList() {
  fetch("https://barry-proxy2.kimethan572.workers.dev?action=listTests")
    .then(res => res.json())
    .then(tests => {
      testSelect.innerHTML = "";
      tests.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = t;
        testSelect.appendChild(opt);
      });
    });
}

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
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
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
    timeLeft--;
    timerEl.textContent = `Time left: ${formatTime(timeLeft)}`;
    if (timeLeft <= 0) {
      stopTimer();
      handleNextStation(true);
    }
  }, 1000);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
}

// ---------------------------
// Show Loading
// ---------------------------
function showLoading() {
  isLoading = true;
  actionButton.disabled = true;
  stopTimer();
  form.innerHTML = '<div class="loading">Loading questions...</div>';
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
// Load Questions
// ---------------------------
function loadQuestions(stationNumber) {
  showLoading();

  fetch(`https://barry-proxy2.kimethan572.workers.dev?test=${userCredentials.test}&station=${stationNumber}`)
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

        if (q.options.length) {
          div.innerHTML = `<p>${q.question}</p>` + q.options.map(opt =>
            `<label><input type="radio" name="q${idx+1}" value="${opt}"> ${opt}</label>`
          ).join("<br>");
        } else {
          div.innerHTML = `<p>${q.question}</p><input type="text" name="q${idx+1}">`;
        }

        form.appendChild(div);
      });

      isLoading = false;
      actionButton.disabled = false;
      updateButtonState();
      startTimer();
    });
}

// ---------------------------
// UI State
// ---------------------------
function updateButtonState() {
  if (currentStation === 0) actionButton.textContent = "Begin Test";
  else if (currentStation === totalStations) actionButton.textContent = "Submit Test";
  else actionButton.textContent = "Next Station";
}

// ---------------------------
// Flow Control
// ---------------------------
function handleNextStation(isAutoAdvance=false) {
  if (isLoading) return;

  stopTimer();
  resultEl.textContent = "";

  if (currentStation === 0) {
    userCredentials.name = document.getElementById("nameInput").value.trim();
    userCredentials.email = document.getElementById("emailInput").value.trim();
    userCredentials.test = testSelect.value;

    countTotalStations().then(max => {
      totalStations = max;
      if (!totalStations) {
        resultEl.textContent = "No stations available.";
        return;
      }
      currentStation = 1;
      stationTitle.textContent = `Test Station ${currentStation}`;
      loadQuestions(currentStation);
      updateButtonState();
    });

  } else if (currentStation < totalStations) {
    if (!isAutoAdvance && !confirm("Moving onto next station means you cannot return. Continue?")) {
      startTimer();
      return;
    }

    submitStation(currentStation, false);
    currentStation++;
    stationTitle.textContent = `Test Station ${currentStation}`;
    loadQuestions(currentStation);
    updateButtonState();

  } else {
    submitStation(currentStation, true);
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
        resultEl.textContent = "Test completed!";
        actionButton.disabled = true;
        actionButton.textContent = "Test Submitted";
        form.innerHTML = "";
      }
    });
}

// ---------------------------
// Init
// ---------------------------
loadTestList();
loadCredentialsForm();

actionButton.addEventListener("click", () => {
  if (!actionButton.disabled) handleNextStation();
});
