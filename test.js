const form = document.getElementById("testForm");
const station = "1"; // Change dynamically per station
const STATION_TIME = 300; // Seconds per station

// Timer
let timeLeft = STATION_TIME;
const timerEl = document.getElementById("timer");
const timerInterval = setInterval(() => {
  timeLeft--;
  timerEl.textContent = `Time left: ${timeLeft}s`;
  if(timeLeft <= 0) {
    clearInterval(timerInterval);
    submitForm();
  }
}, 1000);

// Fetch questions
fetch(`https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec?station=${station}`)
.then(res => res.json())
.then(data => {
  data.forEach((q, idx) => {
    const div = document.createElement("div");
    div.classList.add("question");
    div.innerHTML = `<p>${q.question}</p>` +
      (q.options.length
        ? q.options.map(opt => `<label><input type="radio" name="q${idx+1}" value="${opt}" required> ${opt}</label>`).join("<br>")
        : `<input type="text" name="q${idx+1}" required>`
      );
    form.appendChild(div);
  });
  form.innerHTML += '<button type="submit">Submit</button>';
});

form.addEventListener("submit", e => {
  e.preventDefault();
  clearInterval(timerInterval);
  submitForm();
});

function submitForm() {
  const data = new URLSearchParams();
  data.append("name", prompt("Enter your name:"));
  data.append("email", prompt("Enter your email:"));
  new FormData(form).forEach((value, key) => data.append(key, value));

  fetch("https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec", {
    method: "POST",
    body: data
  })
  .then(res => res.json())
  .then(result => {
    document.getElementById("result").textContent = `Your score: ${result.score}`;
  });
}
