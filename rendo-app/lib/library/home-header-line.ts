const MORNING = [
  "What's on the menu today?",
  "What are we making for breakfast?",
  "Start the day with something good.",
  "Ready to get cooking?",
  "Morning! What are you craving?",
];

const AFTERNOON = [
  "Looking for a lunch idea?",
  "What are you craving for lunch?",
  "Time for a mid-day meal?",
  "What's cooking this afternoon?",
  "What sounds good right now?",
];

const EVENING = [
  "What's for dinner tonight?",
  "What are you craving tonight?",
  "Ready to start dinner?",
  "Time to get cooking.",
  "Who's hungry?",
];

const LATE_NIGHT = [
  "Late night craving?",
  "Midnight snack or planning ahead?",
  "Planning tomorrow's meals?",
  "Looking for a late bite?",
  "What's on your mind?",
];

function phrasesForHour(hour: number) {
  if (hour >= 5 && hour < 11) return MORNING;
  if (hour >= 11 && hour < 16) return AFTERNOON;
  if (hour >= 16 && hour < 21) return EVENING;
  return LATE_NIGHT;
}

/** One random greeting for the current local hour. Call once per load. */
export function pickTimeAwareGreeting(now = new Date()) {
  const phrases = phrasesForHour(now.getHours());
  return phrases[Math.floor(Math.random() * phrases.length)] ?? phrases[0];
}
