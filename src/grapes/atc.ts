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
    encounter: {
      npc: { id: 'ash', name: 'Ash' },
      room: '305',
      intro: [
        { speaker: 'Ash', text: 'Oh, perfect timing. You are literally standing inside it.' },
        { speaker: 'Thor', text: 'Inside what?' },
        { speaker: 'Ash', text: 'ATC, the Algorithmic Thinking Club. This whole game you are playing? Students built it. Right here in 305.' },
      ],
      media: { id: 'atc-what', kind: 'youtube', src: '', caption: 'What is ATC?' },
      check: [{
        kind: 'choice',
        id: 'atc-pitch',
        prompt: "A student leans in the doorway: 'Is this the coding club? My friend said it's only for geniuses.' What do you tell them?",
        objective: 'How to join',
        options: [
          { text: 'Pretty much. You need to be good at math first.', correct: false, reply: 'The student shrugs and walks off. Ash: "That is not us at all, ATC is built for beginners. Try again."' },
          { text: 'Nope, it is built for beginners. Come learn with us!', correct: true, reply: 'The student grins and steps in to sit down. Ash: "And that is how it is done. Welcome aboard."' },
          { text: 'I do not know, ask someone else.', correct: false, reply: 'The student leaves, unsure. Ash: "We can do better than that, tell them what we are really about."' },
        ],
      }],
      outro: [
        { speaker: 'Ash', text: 'We meet Thursdays after school, room 305. No experience needed, just show up.' },
        { speaker: 'Thor', text: 'I might just do that.' },
      ],
      reward: { points: 10, handbookEntryId: 'atc', achievementId: 'atc-recruit' },
    },
  },
}
