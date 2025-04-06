const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  email: String,
  username: String,
  quizzes: [
    {
      topic: String,
      date: { type: Date, default: Date.now },
      results: [
        {
          questionNumber: Number,
          question: String,
          yourAnswer: String,
          correctAnswer: String,
          isCorrect: Boolean
        }
      ]
    }
  ],
  resources: [
    {
      topic: String,
      content: String,
      date: { type: Date, default: Date.now }
    }
  ],
  notes: [
    {
      title: String,
      content: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  todos: [
    {
      task: String,
      completed: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    },
  ]
  
});

userSchema.plugin(passportLocalMongoose);
module.exports = mongoose.model("User", userSchema);
