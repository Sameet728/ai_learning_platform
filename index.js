const express = require('express');
const app = express();
const path = require("path");
const mongoose = require('mongoose');

const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/profile.js");
const session = require("express-session");
const MongoStore = require('connect-mongo');
require('dotenv').config();

const dburl = process.env.ATLAS_URL;
const apiKey =process.env.api_Key  ; // Store your API key in .env

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login'); // Or wherever your login route is
}


// MongoDB Session Store
const store = MongoStore.create({
  mongoUrl: dburl,
  crypto: {
    secret: "dciudcdh",
  },
  touchAfter: 24 * 3600,
});

store.on("error", (error) => {
  console.log("ERROR in Mongo SESSION STORE", error);
});

// Session configuration
const sessionOptions = {
  store,
  secret: "hfwfgfuhfuwhfdh",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 1000 * 60 * 60,
    maxAge: 7 * 24 * 1000 * 60 * 60,
    httpOnly: true,
  },
};
app.use(session(sessionOptions));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Current User Middleware
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// MongoDB Connection
async function main() {
  try {
    await mongoose.connect(dburl);
    console.log("Connection Successful");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}
main();

// Google Generative AI Setup
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Generate AI Response
async function run(promptMsg) {
  try {
    const prompt = promptMsg;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = await response.text(); // await here to correctly handle the Promise
    console.log(text);
    return text;
  } catch (e) {
    console.error("Error in AI Response:", e);
    return "An error occurred while processing your request.";
  }
}

// Routes
app.get("/", async (req, res) => {
  try {
   
    res.render("../views/chat.ejs");
  } catch (e) {
    console.error("Error rendering chats:", e);
    res.redirect("/error"); // Redirect to a proper error page or handler
  }
});


app.get("/quiz", async (req, res) => {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.redirect("/login"); // Redirect to login if user is not authenticated
    }

    res.render("quiz"); // No need for ../views, Express views dir handles it
  } catch (e) {
    console.error("Error rendering quiz page:", e);
    res.status(500).redirect("/error"); // Optional fallback
  }
});


app.post("/quizmaker", async (req, res) => {
  try {
    const topic = req.body.topic;
    console.log("User selected topic:", topic);

    const prompt = `
      Create a 10-question multiple choice quiz on the topic "${topic}".
      Format the output as a valid JSON array like this (no extra text or markdown):
      [
        {
          "question": "Question text?",
          "options": ["option1", "option2", "option3", "option4"],
          "answer": "correct option"
        },
        ...
      ]
    `;

    let quizRaw = await run(prompt);

    // Clean markdown formatting from response
    if (typeof quizRaw === "string") {
      quizRaw = quizRaw.trim();
      // Remove triple backticks if present
      quizRaw = quizRaw.replace(/```json|```/g, '');
    }

    const quiz = JSON.parse(quizRaw);
    console.log("Parsed quiz:", quiz);

    res.render("quizgive.ejs", { quiz, topic });

  } catch (e) {
    console.error("Error rendering quiz page:", e);
    res.status(500).redirect("/error");
  }
});


app.post("/submit-quiz", (req, res) => {
  try {
    const topic = req.body.topic;
    const userAnswers = Object.values(req.body).slice(0, -2); // Exclude hidden fields
    const correctAnswers = JSON.parse(req.body.answers);
    const questions = JSON.parse(req.body.questions);

    let score = 0;
    const results = [];

    for (let i = 0; i < correctAnswers.length; i++) {
      const isCorrect = userAnswers[i] === correctAnswers[i];
      if (isCorrect) score++;
      results.push({
        questionNumber: i + 1,
        question: questions[i],
        yourAnswer: userAnswers[i],
        correctAnswer: correctAnswers[i],
        isCorrect
      });
    }

    res.render("quiz-result.ejs", {topic,
      score,
      total: correctAnswers.length,
      results
    });

  } catch (err) {
    console.error("Error scoring quiz:", err);
    res.status(500).send("Something went wrong");
  }
});


app.post("/generate-resource", async (req, res) => {
  const topic = req.body.topic;
  const quizResults = JSON.parse(req.body.quizResults); // Expects an array like [{question, correctAnswer, userAnswer, isCorrect}, ...]

  console.log("Generating resource for topic:", topic);
  console.log(req.user);
  console.log(req.user._id);
  // console.log("User's quiz performance:", quizResults);


  const prompt = `
You are an intelligent learning assistant. A student completed a quiz on the topic: **"${topic}"**.

Below is their performance data in JSON format:

${JSON.stringify(quizResults, null, 2)}

Your tasks:

1. Analyze the student's performance:
   - Show total number of questions.
   - Count correct vs incorrect answers.
   - Identify strengths (concepts with correct answers).
   - Identify weaknesses (concepts with incorrect answers).

2. Generate a personalized study plan with these clearly formatted sections:

---

✨ **Performance Summary** ✨  
- 📊 **Total Questions**: [number]  
- ✅ **Correct Answers**: [number] — highlight strongest concepts.  
- ❌ **Incorrect Answers**: [number] — list weakest areas.  
- 💡 **Key Observations**: 1–2 lines summarizing their performance.

---

🎯 **Common Mistakes and Weak Areas** 🎯  
Use emojis to classify types of issues:  
- 🔴 **Repeated Errors**: [Concept] – short explanation.  
- 🔄 **Needs More Practice**: [Concept] – explain why it’s tricky.  
- ⚠️ **Critical Gaps**: [Concept] – explain why it's essential to master.

---

📚 **Recommended Learning Resources** 📚  

📹 *Video Resources*:  
- ▶️ [**Title**](https://full-url.com) – Covers [concept] clearly.  
- ▶️ [**Title**](https://full-url.com) – Step-by-step explanation of [skill].

📄 *Articles / Blogs*:  
- 📖 [**Title**](https://full-url.com) – Explains [concept] with examples.  
- 📖 [**Title**](https://full-url.com) – Common mistakes and how to fix them.

---

🧠 **Practice Problems** 🧠  
Focus only on the student’s weak areas:  
- 🔹 **Problem 1**: [Clear equation or question]  
  *(e.g., Solve for x: 3x - 7 = 14)*  
- 🔹 **Problem 2**: [Another practice question]  
- 🔹 **System of Equations**:  
  ⎧ 2x + y = 5  
  ⎨ x - y = 1  
  ⎩ *(Solve for x and y)*

---

🚀 **Next Steps** 🚀  
- If score is **≥80%**:  
  - 🚀 Explore advanced topics like [Topic 1](https://url)  
  - 🚀 Try [Topic 2](https://url) with in-depth resources.

- If score is **<80%**:  
  - 🔄 Focus on [weak topic] with daily 10-minute reviews.  
  - ⏳ Use a spaced repetition routine (e.g., every 3 days).

---

📌 **Formatting Rules**:  
- Use full clickable URLs like \`[Text](https://...)\`.  
- Use **bold** for emphasis, *italics* for minor notes.  
- Put equations or math expressions on **new lines**.  
- Use markdown-style structure — this output will be converted into HTML or EJS for display.
`;


let resource= await run(prompt);
console.log(req.user)
if (req.user) {
  console.log(req.user);
  const user = await User.findById(req.user._id);

  // Save quiz
  user.quizzes.push({
    topic,
    results: quizResults
  });

  // Save resource
  user.resources.push({
    topic,
    content: resource
  });

  await user.save();
}
res.render("resource-page.ejs", {topic,
 resource
});

});


app.get('/dashboard', async (req, res) => {
  try {
    const user = req.user;
    console.log(user);
    res.render("dashboard", { user }); 
  } catch (err) {
    console.error("Dashboard fetch error:", err);
    res.redirect("/login");
  }
});









app.get("/delete", (req, res) => {
  res.send("deleting ");
});

// User Routes
app.get("/user", (req, res) => {
  let userdetails = req.user;
  if (!userdetails) {
    console.log("Please log in first");
    res.redirect("/login");
  } else {
    console.log(userdetails);
    res.send(userdetails);
  }
});

// Signup Render Route
app.get("/signup", (req, res) => {
  res.render("../views/users/signup.ejs");
});

// Login Render Route
app.get("/login", (req, res) => {
  res.render("../views/users/login.ejs");
});

// Signup Logic
app.post("/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;
    console.log(username, email, password);

    let user = await User.findOne({ username: username });
    let alreadyuser = await User.findOne({ email: email });

    if (!user && !alreadyuser) {
      const newUser = new User({ email, username });
      const registeredUser = await User.register(newUser, password);
      console.log("Registered User:", registeredUser);
      res.redirect("/login");
    } else if (alreadyuser) {
      res.send("Email already exists");
    } else {
      res.send("Username already exists");
    }
  } catch (e) {
    console.error("Error during signup:", e);
    res.redirect("/signup");
  }
});

// Login Logic
app.post(
  "/login",
  passport.authenticate("local", { failureRedirect: "/login?error=1", }),
  async (req, res) => {
    try {
      let { username } = req.body;
      let user = await User.findOne({ username: username });

      if (!user) {
        // Redirecting to the signup page if user doesn't exist
        console.log("error", "Please sign up first."); // Use flash messages for better UX
        return res.redirect("/signup");
      }

      console.log("Logged In User:", user);
      res.redirect("/");
    } catch (error) {
      console.error("Error during login:", error);
      res.redirect("/login");
    }
  }
);

app.get('/dashboard', (req, res) => {
  res.send(
    "Welcome back, Sameet! 🚀"
  );
});



app.post('/notes', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user._id);
  user.notes.push({
    title: req.body.title,
    content: req.body.content
  });
  await user.save();
  res.redirect('/notes');
});


app.get('/notes', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.render('notes', { user });
});

app.get('/notes/edit/:index', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user._id);
  const note = user.notes[req.params.index];
  res.render('editNote', { note, index: req.params.index });
});

// Handle Edit
app.post('/notes/edit/:index', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user._id);
  const { title, content } = req.body;
  user.notes[req.params.index] = { title, content };
  await user.save();
  res.redirect('/notes');
});

// Handle Delete
app.post('/notes/delete/:index', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user._id);
  user.notes.splice(req.params.index, 1);
  await user.save();
  res.redirect('/notes');
});



// TODO page - view list
app.get('/todo', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.user._id);
  
  res.render('todos', { todos: user.todos });
});

// Add a todo: /todo/add?task=Read+book
app.get('/todo/add', isAuthenticated, async (req, res) => {
  const { task } = req.query;
  if (task) {
    await User.findByIdAndUpdate(req.user._id, {
      $push: { todos: { task } },
    });
  }
  res.redirect('/todo');
});

// Complete a todo: /todo/complete?index=0
app.get('/todo/complete', isAuthenticated, async (req, res) => {
  const { index } = req.query;
  const user = await User.findById(req.user._id);
  if (user.todos[index]) {
    user.todos[index].completed = true;
    await user.save();
  }
  res.redirect('/todo');
});

// Delete a todo: /todo/delete?index=0
app.get('/todo/delete', isAuthenticated, async (req, res) => {
  const { index } = req.query;
  const user = await User.findById(req.user._id);
  if (user.todos[index]) {
    user.todos.splice(index, 1);
    await user.save();
  }
  res.redirect('/todo');
});


// Logout Logic
app.get("/logout", (req, res, next) => {
  req.logout(function (error) {
    if (error) {
      return next(error);
    }
    
    res.redirect("/login");
   
  });
});

// Server Start
app.listen(3001, () => {
  console.log("Server running on port 3000");
});
