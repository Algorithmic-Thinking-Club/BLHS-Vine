import type { GrapeModule } from '../vine/contract'

// The beginner template: a config-only grape (no Component). An ATC member writes exactly this
// shape — a manifest plus content JSON — and the vine renders it. Doubles as ATC recruiting.
export const atcGrape: GrapeModule = {
  manifest: {
    id: 'atc',
    title: 'Algorithmic Thinking Club',
    category: 'interest-club',
    blurb: "Bonney Lake's first computer-science club. Build real projects and learn to code.",
    author: 'Ash',
    estimatedMinutes: 5,
    learningObjectives: ['What ATC is', 'What ATC builds', 'How to join'],
    placement: { district: 'stem', building: 'atc-room' },
    completion: { quizAttempted: true },
    progression: {
      contributesToGpa: true,
      achievements: [{ id: 'atc-recruit', label: 'ATC Recruit', when: 'completed' }],
    },
  },
  content: {
    intro: [
      { speaker: 'Thor', text: 'Welcome to the STEM wing. This room belongs to ATC, the Algorithmic Thinking Club.' },
      { speaker: 'Thor', text: "It is the first CS club at Bonney Lake, and its members built the game you are playing right now." },
    ],
    clips: [{ id: 'atc-what', kind: 'youtube', src: '', caption: 'What is ATC? (clip placeholder)' }],
    quiz: [
      {
        id: 'q1',
        prompt: 'What does ATC stand for?',
        choices: ['Advanced Tech Coalition', 'Algorithmic Thinking Club', 'After-school Tutoring Center'],
        correctIndex: 1,
        explanation: 'ATC is the Algorithmic Thinking Club.',
        objective: 'What ATC is',
      },
      {
        id: 'q2',
        prompt: 'What do ATC members build?',
        choices: ['Robots only', 'This adventure game and other coding projects', 'Nothing yet'],
        correctIndex: 1,
        explanation: 'Members learn to code by building real projects, including this game.',
        objective: 'What ATC builds',
      },
      {
        id: 'q3',
        prompt: 'Do you need coding experience to join?',
        choices: ['Yes, advanced students only', 'No, beginners are welcome', 'You must take AP CS first'],
        correctIndex: 1,
        explanation: 'ATC is built for near-beginners. Anyone can join and learn.',
        objective: 'How to join',
      },
    ],
    outro: [{ speaker: 'Thor', text: 'That is ATC. If building games and learning to code sounds fun, come find us in the STEM wing.' }],
    // The in-world SCENE (game arm): a designed RPG encounter, not a slideshow. Teaches what ATC is /
    // builds / how to join through a meta hook, the real clip, and a consequential choice with a payoff.
    handbook: [{
      id: 'atc',
      heading: 'Algorithmic Thinking Club (ATC)',
      body: "Bonney Lake's first computer-science club. Members learn to code by building real projects, including this game. Beginners welcome. Meets Thursdays in room 305.",
    }],
    // In-world ATC scene. Content is REAL + specific (BLHS's first CS club, student-founded fall 2025,
    // members built THIS game, a 3-person podium sweep year one, hackathons, beginners from zero, room 305).
    // MINI-TASKS for Thor are designed between beats (implemented by the scene engine, see docs/vision):
    //   - "Run it": Thor presses a key at a laptop → the screen lights up with the game build (you made something).
    //   - "Inspect the trophy": examine the podium-sweep medals → caption (ATC competes and wins).
    //   - "Peek a project": pick an ambient student's station → a one-line look at what they're building.
    encounter: {
      npc: { id: 'ash', name: 'Ash' },
      room: '305',
      intro: [
        { speaker: 'Ash', text: "Hey, perfect timing. You're standing in the first computer-science club Bonney Lake has ever had. I started it last fall." },
        { speaker: 'Thor', text: 'A whole club, just for coding?' },
        { speaker: 'Ash', text: "For building. This game you're walking around in right now? We made it. Students, from nothing." },
      ],
      media: { id: 'atc-what', kind: 'youtube', src: '', caption: 'Inside ATC' },
      check: [{
        kind: 'choice',
        id: 'atc-pitch',
        prompt: "A student leans in: \"Is this the genius coding club? I've literally never written a line of code.\" What do you tell them?",
        objective: 'How to join',
        options: [
          { text: "Yeah, you'd want some experience first.", correct: false, reply: 'The student backs out. Ash: "No, no, we teach from zero, that’s the entire point. Try that again."' },
          { text: "Perfect, that's exactly who it's for. We start everyone from scratch.", correct: true, reply: 'The student grins and pulls up a chair. Ash: "That’s it. Welcome aboard."' },
          { text: "Not sure, maybe ask a teacher?", correct: false, reply: 'The student leaves, unsure. Ash: "Come on, you know this one, tell them what we’re about."' },
        ],
      }],
      outro: [
        { speaker: 'Ash', text: "First year we even swept a competition, three of us took first, second, and third." },
        { speaker: 'Ash', text: "We meet in 305 after school. We build the game, hit hackathons, compete. Beginners every time. Come find us." },
        { speaker: 'Thor', text: 'I think I will.' },
      ],
      reward: { points: 10, handbookEntryId: 'atc', achievementId: 'atc-recruit' },
    },
  },
}
