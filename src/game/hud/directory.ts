/* every club, sport and course Bonney Lake really offers, as the school publishes them */

export type DirectoryRow = {
  /** the school's own name for it */
  name: string
  /** one short line saying what it is, from the source */
  what?: string
  /** day, time and room exactly as the school publishes them */
  meets?: string
  /** the honest gap, where the source has one */
  note?: string
}

export type DirectoryGroup = {
  heading: string
  /** where in `docs/blhs/sourced-facts.md` these rows come from */
  from: string
  rows: DirectoryRow[]
}

export type DirectorySection = {
  id: 'clubs' | 'sports' | 'classes'
  title: string
  /** one sentence a student reads before the list */
  lede: string
  groups: DirectoryGroup[]
}

/* ---- 1. CLUBS ------------------------------------------------------------
 * sourced-facts.md §1, from the school's own clubs hub and its three sub-pages */

const CLUBS: DirectoryGroup[] = [
  {
    heading: 'Career and academic clubs',
    from: 'sourced-facts.md §1, competitive / co-curricular',
    rows: [
      { name: 'DECA', what: 'Business and marketing: finance, hospitality, management', meets: 'Thu 2:10-2:40, 200 Flex' },
      { name: 'FCCLA', what: 'Family, Career and Community Leaders of America', meets: 'Tue and Thu 2:30-3:30, Rm 104' },
      { name: 'HOSA', what: 'Medical and healthcare careers, and national competition', meets: 'Fri 2:30-2:50, Rm 361' },
      { name: 'Culinary Arts Club', what: 'Cooking and food prep, with a competition team', meets: '3rd Tue of the month 2:30, Rm 104' },
      { name: 'Panther Robotics, FRC Team 3218', what: 'FIRST Robotics. Rookie year 2010, Pacific Northwest district', meets: 'Mon and Thu, Rm 206 and 207' },
      { name: 'SkillsUSA', what: 'Career and technical leadership and skills competition', meets: 'Tue and Thu 2:30-3:30, Rm 302' },
      { name: 'Educators Rising', what: 'The future-teacher pathway, paired with Teaching Academy', meets: '2nd Tue of the month 2:30-3:30, Rm 802' },
      { name: 'Math Club', what: 'Math enrichment and competition', meets: 'Mon, Tue and Thu 2:30-3:30, 400 Flex' },
      {
        name: 'Algorithmic Thinking Club',
        what: "Bonney Lake's first computer science club. Its members build this game",
        note: 'Founded September 2025 and not on the official club list yet',
      },
    ],
  },
  {
    heading: 'Service clubs',
    from: 'sourced-facts.md §1, service clubs',
    rows: [
      { name: 'Key Club', what: 'Student-led service: leadership, character and inclusiveness', meets: 'Tue 2:10-2:30, 200 Flex' },
      { name: 'Leo Club', what: 'Community service, backed by the Bonney Lake Lions Club', note: 'No meeting time published' },
      { name: 'National Honor Society', what: 'Scholarship, service, leadership and character', meets: 'Alternate Mondays, 8:30-9:00 or 2:30-3:00' },
      { name: 'Panther Crue', what: 'Freshman mentoring and peer connection', meets: '1st Tue 6:30 and 2:30, Rm 356' },
    ],
  },
  {
    heading: 'Student interest clubs',
    from: 'sourced-facts.md §1, student interest clubs',
    rows: [
      { name: 'Art Club', what: 'Group and individual art, displays and local contests', meets: 'Mon 2:20-3:20, Rm 503' },
      { name: 'Band Club', what: 'Supplements the curricular band', meets: 'Tue 2:30-3:30, Rm 506' },
      { name: 'Choir Club', what: 'Outreach, competitions, travel and talent shows', meets: 'Mon and Tue 2:20-3:30, Rm 505' },
      { name: 'Drama Club', what: 'Theatre skills and productions, and the state Thespian Festival', note: 'Meeting time to be announced' },
      { name: 'Game / Book Club', what: 'Board games, video games and books, in the library', meets: 'Thu 2:30-3:30, Library' },
      { name: 'Gender and Sexuality Alliance (GSA)', what: 'An accepting environment, civic engagement and education', meets: 'Thu 2:30-4:00, Rm 410' },
      { name: 'International Club', what: 'Meet exchange students and share cultures and food', meets: 'Monthly, Mon 2:30-3:30, Rm 455' },
      { name: 'Jesus Club', what: 'Christian fellowship', meets: 'Alternate Mondays 8:30-9:00, Stage' },
      { name: 'Speak Up', what: 'Student-led social justice and equity', meets: 'Thu 2:30-3:30, Rm 352' },
      { name: 'Asian American Pacific Islander (AAPI) Club', what: 'A cultural affinity club', meets: 'Mon 8:30-9:30, Rm 304' },
      { name: 'Latino Club', what: 'A cultural affinity club', meets: 'Select dates 8:30-9:00, Rm 406' },
      { name: 'Earth Savers / Journalism Club', what: 'Environmental work and journalistic writing', meets: 'Thu 2:30-3:30, Rm 405' },
      { name: 'Digital Media Club', what: 'Panther Media Network: news, filming and interviews', meets: 'Mon 2:30-3:00 and Thu 2:30-3:30, Rm 302' },
      { name: 'Yearbook', what: 'Photography, layout and story, producing the yearbook', note: 'No meeting time published' },
      { name: 'Travel Club', what: 'Student travel', meets: 'Wed 5:00-8:00, Rm 361' },
      { name: 'Panther Club', what: 'School spirit and activities', meets: '400 Flex and Rm 455' },
      { name: 'Air Force JROTC Club', what: 'Drill, color guard, rocketry, fitness and community service', meets: 'Tue 2:30-3:00, Rm 901' },
    ],
  },
]

/* the sports, by season, with the teams that exist and whether there are cuts */

const SPORTS: DirectoryGroup[] = [
  {
    heading: 'Fall',
    from: 'sourced-facts.md §2, fall sports',
    rows: [
      { name: 'Cross Country', what: 'Varsity and JV, co-ed', meets: 'No tryouts' },
      { name: 'Football', what: 'Varsity, JV and Freshmen, boys', meets: 'No tryouts. Runs into December for the postseason' },
      { name: 'Girls Golf', what: 'Varsity', meets: 'Cuts if the turnout requires it' },
      { name: 'Girls Soccer', what: 'Varsity, JV and C-team', meets: 'Tryouts and cuts' },
      { name: 'Girls Swim and Dive', what: 'Varsity and JV', meets: 'No tryouts' },
      { name: 'Boys Tennis', what: 'Varsity and JV', meets: 'No tryouts. State is in the spring' },
      { name: 'Volleyball', what: 'Varsity, JV and C, girls', meets: 'Tryouts and cuts' },
    ],
  },
  {
    heading: 'Winter',
    from: 'sourced-facts.md §2, winter sports',
    rows: [
      { name: 'Boys Basketball', what: 'Varsity, JV and C', meets: 'Cuts. November to January, postseason into March' },
      { name: 'Girls Basketball', what: 'Varsity, JV and C', meets: 'Cuts' },
      { name: 'Gymnastics', what: 'Varsity and JV', meets: 'No cuts' },
      { name: 'Girls Bowling', what: 'Varsity', meets: 'Tryouts in early November' },
      { name: 'Boys Swim and Dive', what: 'Varsity and JV', meets: 'No cuts' },
      { name: 'Wrestling', what: 'Varsity and JV, boys and girls', meets: 'No cuts' },
      { name: 'Girls Flag Football', what: 'Varsity, JV and C', meets: 'No cuts' },
    ],
  },
  {
    heading: 'Spring',
    from: 'sourced-facts.md §2, spring sports',
    rows: [
      { name: 'Baseball', what: 'Varsity, JV and C, boys', meets: 'Cuts' },
      { name: 'Boys Golf', what: 'Varsity and JV', meets: 'Cuts if the turnout requires it' },
      { name: 'Boys Lacrosse', what: 'Varsity', meets: 'No cuts' },
      { name: 'Girls Lacrosse', what: 'Varsity and JV', meets: 'No cuts' },
      { name: 'Boys Soccer', what: 'Varsity, JV and C', meets: 'Cuts' },
      { name: 'Softball', what: 'Fastpitch. Varsity, JV and C, girls', meets: 'Cuts' },
      { name: 'Girls Tennis', what: 'Varsity and JV', meets: 'No cuts' },
      { name: 'Track and Field', what: 'Varsity and JV, co-ed', meets: 'No cuts' },
    ],
  },
]

/* ---- 3. CLASSES ----------------------------------------------------------
 * sourced-facts.md §3, off the SBLSD course catalog. A course has a grade span
 * and a department rather than a room, so that is what the row carries. */

const CLASSES: DirectoryGroup[] = [
  {
    heading: 'Advanced Placement',
    from: 'sourced-facts.md §3, the full AP course list',
    rows: [
      { name: 'AP Human Geography', what: 'Social Studies', meets: 'Grades 9-12' },
      { name: 'AP Biology', what: 'Lab Science', meets: 'Grades 10-12' },
      { name: 'AP Chemistry', what: 'Lab Science', meets: 'Grades 10-12' },
      { name: 'AP Computer Science Principles', what: 'Science', meets: 'Grades 10-12' },
      { name: 'AP Music Theory', what: 'Fine Arts', meets: 'Grades 10-12' },
      { name: 'AP Psychology', what: 'Social Studies', meets: 'Grades 10-12' },
      { name: 'AP Statistics', what: 'Math and CTE', meets: 'Grades 10-12' },
      { name: 'AP Studio Art: Drawing', what: 'Fine Arts', meets: 'Grades 10-12' },
      { name: 'AP Studio Art: 2D Design', what: 'Fine Arts', meets: 'Grades 10-12' },
      { name: 'AP Studio Art: 3D Design', what: 'Fine Arts', meets: 'Grades 10-12' },
      { name: 'AP World History', what: 'Social Studies', meets: 'Grade 10' },
      { name: 'AP Seminar', what: 'The first AP Capstone course, paired with Honors 10th grade English' },
      { name: 'AP Calculus AB', what: 'Math', meets: 'Grades 11-12' },
      { name: 'AP Calculus BC', what: 'Math', meets: 'Grades 11-12' },
      { name: 'AP Computer Science, Java', what: 'Science', meets: 'Grades 11-12' },
      { name: 'AP Language and Composition', what: 'English', meets: 'Grade 11' },
      { name: 'AP Physics 1', what: 'Lab Science', meets: 'Grades 11-12' },
      { name: 'AP Research', what: 'The AP Capstone capstone', meets: 'Grades 11-12' },
      { name: 'AP Spanish Language and Culture', what: 'World Language', meets: 'Grades 11-12' },
      { name: 'AP U.S. History', what: 'Social Studies', meets: 'Grade 11' },
      { name: 'AP Literature and Composition', what: 'English', meets: 'Grade 12' },
      { name: 'AP U.S. Government and Politics', what: 'Social Studies', meets: 'Grade 12' },
    ],
  },
  {
    heading: 'World languages',
    from: 'sourced-facts.md §3, world languages',
    rows: [
      { name: 'Spanish I-IV', what: 'World Language' },
      { name: 'Heritage Spanish I-II', what: 'World Language' },
      { name: 'French I-IV', what: 'World Language' },
      { name: 'American Sign Language (ASL) I-II', what: 'Counts as World Language or CTE' },
      { name: 'Translation and Interpretation I', what: 'Counts as World Language or CTE' },
    ],
  },
  {
    heading: 'Career and technical pathways',
    from: 'sourced-facts.md §3, CTE pathways',
    rows: [
      { name: 'Arts and Communication', what: 'Digital media and graphic design, on the Adobe certification path' },
      { name: 'Business and Marketing', what: 'Intro to Business and Marketing, Accounting I, Sports and Entertainment Marketing, Project Management. Feeds DECA' },
      { name: 'Family and Consumer Sciences', what: 'Culinary Arts I to III, Teaching Academy I and II, Independent Living, Child Development. Feeds FCCLA and Educators Rising' },
      { name: 'Health Science', what: 'Sports Medicine I and Biology: Health Science. Feeds HOSA' },
      { name: 'Information and Technology', what: 'AP Computer Science, Cybersecurity (PLTW), Intro to Programming through Video Game Design, Game Design I, web design' },
      { name: 'Air Force JROTC', what: 'The JROTC course sequence: drill, leadership and aerospace science' },
      { name: 'Manufacturing and Engineering', what: 'Intro to Engineering Design, Principles of Engineering, Aerospace Engineering, Computer Integrated Manufacturing, Robotics I, all PLTW. Feeds FRC 3218' },
    ],
  },
  {
    heading: 'Music, theatre and art',
    from: 'sourced-facts.md §3, music and performing arts',
    rows: [
      { name: 'Band', what: 'The curricular band sequence. Feeds Band Club' },
      { name: 'Choir', what: 'The curricular choir sequence. Feeds Choir Club' },
      { name: 'Orchestra', what: 'The curricular orchestra sequence' },
      { name: 'Drama', what: 'Advanced Actor’s Studio and the theatre sequence. Feeds Drama Club' },
      { name: 'AP Music Theory', what: 'The equivalent of a first year of college music theory' },
    ],
  },
]

export const DIRECTORY: DirectorySection[] = [
  {
    id: 'clubs',
    title: 'Clubs',
    lede: 'Every club on the school’s own list, with when and where it meets.',
    groups: CLUBS,
  },
  {
    id: 'sports',
    title: 'Sports',
    lede: 'The Panthers play 4A in the South Puget Sound League. Twenty-two teams across three seasons.',
    groups: SPORTS,
  },
  {
    id: 'classes',
    title: 'Classes',
    lede: 'What the course catalog offers, by department. Two of them are your electives this year.',
    groups: CLASSES,
  },
]

/** how many rows the whole directory holds, which is what a heading counts */
export function directoryCount(id?: DirectorySection['id']): number {
  return DIRECTORY
    .filter((s) => !id || s.id === id)
    .reduce((n, s) => n + s.groups.reduce((m, g) => m + g.rows.length, 0), 0)
}
