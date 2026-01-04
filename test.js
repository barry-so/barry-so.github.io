// ===========================
// Test.js for Station-Based Test
// ===========================

const form = document.getElementById("testForm");
const station = "1"; // Change dynamically per station
const STATION_TIME = 300; // seconds per station

const timerEl = document.getElementById("timer");
const resultEl = document.getElementById("result");

let timeLeft = STATION_TIME;
let timerInterval;

// ---------------------------
// Start Timer
// ---------------------------
function startTimer() {
  timerEl.textContent = `Time left: ${timeLeft}s`;
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `Time left: ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      submitForm();
    }
  }, 1000);
}

// ---------------------------
// Fetch Questions from Worker
// ---------------------------
function loadQuestions() {
  fetch(`https://barry-proxy2.kimethan572.workers.dev?station=${station}`)
    .then(res => res.json())
    .then(data => {
      if (!data.length) {
        form.innerHTML = "<p>No questions found for this station.</p>";
        return;
      }

      data.forEach((q, idx) => {
        const div = document.createElement("div");
        div.classList.add("question");

        if (q.options && q.options.length > 0) {
          // Multiple choice
          div.innerHTML = `<p>${q.question}</p>` +
            q.options.map(opt =>
              `<label><input type="radio" name="q${idx + 1}" value="${opt}" required> ${opt}</label>`
            ).join("<br>");
        } else {
          // Open-ended
          div.innerHTML = `<p>${q.question}</p><input type="text" name="q${idx + 1}" required>`;
        }

        form.appendChild(div);
      });

      // Add submit button
      form.innerHTML += '<button type="submit">Submit</button>';

      // Start timer after questions are loaded
      startTimer();
    })
    .catch(err => {
      form.innerHTML = `<p>Error loading questions: ${err}</p>`;
      console.error(err);
    });
}

// ---------------------------
// Submit Answers
// ---------------------------
function submitForm() {
  clearInterval(timerInterval);

  const data = new URLSearchParams();
  data.append("name", prompt("Enter your name:"));
  data.append("email", prompt("Enter your email:"));
  data.append("station", station);

  new FormData(form).forEach((value, key) => data.append(key, value));

  fetch("https://barry-proxy2.kimethan572.workers.dev/", {
    method: "POST",
    body: data
  })
    .then(res => res.json())
    .then(result => {
      resultEl.textContent = `Your score: ${result.score}`;
      form.reset();
    })
    .catch(err => {
      resultEl.textContent = `Error submitting answers: ${err}`;
      console.error(err);
    });
}

// ---------------------------
// Form Event Listener
// ---------------------------
form.addEventListener("submit", e => {
  e.preventDefault();
  submitForm();
});

// ---------------------------
// Initialize
// ---------------------------
loadQuestions();
