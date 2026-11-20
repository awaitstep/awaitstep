import type { Person } from '../../../types/dashboard/session'

// The canvas's sample people. Ama is the default dummy session (org owner).

export const AMA = 'usr_ama'
export const DANIEL = 'usr_daniel'
export const LENA = 'usr_lena'
export const PRIYA = 'usr_priya'
export const TOM = 'usr_tom'
export const JONAS = 'usr_jonas'
export const TOMAS = 'usr_tomas'

export const PEOPLE: Person[] = [
  { id: AMA, name: 'Ama Mensah', email: 'ama@acme.test', initials: 'AM', image: null },
  { id: DANIEL, name: 'Daniel Kim', email: 'daniel@acme.test', initials: 'DK', image: null },
  { id: LENA, name: 'Lena Ortiz', email: 'lena@acme.test', initials: 'LO', image: null },
  { id: PRIYA, name: 'Priya Shah', email: 'priya@acme.test', initials: 'PS', image: null },
  { id: TOM, name: 'Tom Becker', email: 'tom@acme.test', initials: 'TB', image: null },
  { id: JONAS, name: 'Jonas Reed', email: 'jonas@acme.test', initials: 'JR', image: null },
  { id: TOMAS, name: 'Tomás Barros', email: 'tomas@bolt.test', initials: 'TB', image: null },
]
