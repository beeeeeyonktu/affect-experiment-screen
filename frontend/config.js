export const SPEED_GROUPS = {
  slow: { ms: 333, wpm: 180 },
  medium: { ms: 250, wpm: 240 },
  fast: { ms: 200, wpm: 300 }
};

export const MAIN_RUNS = 3;
export const PRACTICE_RUNS = 2;
export const FEELING_LABELS = [
  "interest",
  "joy",
  "pleasure",
  "pride",
  "amusement",
  "relief",
  "contentment",
  "love",
  "anger",
  "fear",
  "anxiety",
  "sadness",
  "shame",
  "guilt",
  "disgust",
  "contempt"
];

export const CALIBRATION_SAMPLE =
  "In this task, words appear one by one. Hold the space bar when your internal feeling becomes uncertain, and release when your interpretation settles.";

export const PRACTICE_TEXTS = [
  "Mina read the message twice and smiled, sure she had been chosen for the lead role. She called her sister immediately, already planning what to wear for rehearsal. Ten minutes later, another email arrived with an apology: final decisions had not been made yet. Mina put her phone down, reread the line, and felt that bright certainty turn into an uneasy wait.",
  "The crowd cheered as the lights dropped and the first chord rang out. Friends shouted and grinned, convinced the night would be unforgettable. Then the singer asked for calm: the sound system had failed, so the set would be acoustic only. Some people groaned, others listened, and the room shifted from excitement to uncertainty before settling into a quieter closeness."
];

export const INTRO_SLIDES = [
  {
    title: "What is an affective change?",
    image: "/graphics/image_1.png",
    body: "Focus on how your felt interpretation changes while the story unfolds."
  },
  {
    title: "When to press and hold",
    image: "/graphics/image_2.png",
    body: "Press as soon as you sense a shift, even if it feels subtle."
  },
  {
    title: "How long to hold",
    image: "/graphics/image_3.png",
    body: "Keep holding while your interpretation feels uncertain."
  },
  {
    title: "When to release",
    image: "/graphics/image_4.png",
    body: "Release once your interpretation feels stable again."
  },
  {
    title: "What your responses represent",
    image: "/graphics/image_5.png",
    body:
      "This image is only an example of how your presses map onto text during analysis. <strong>You will not see yellow highlighting while you are doing the task.</strong>"
  },
  {
    title: "Questions after each text",
    image: "/graphics/image_6.png",
    body: "After each full text, you will answer a few short questions about each detected change."
  }
];
