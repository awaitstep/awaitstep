// The canvas's sample people, as the API lists a person. Ama is the default
// viewer (Acme's only owner).

export const AMA = 'usr_ama'
export const DANIEL = 'usr_daniel'
export const LENA = 'usr_lena'
export const PRIYA = 'usr_priya'
export const TOM = 'usr_tom'
export const JONAS = 'usr_jonas'
export const TOMAS = 'usr_tomas'

export type PersonId =
  typeof AMA | typeof DANIEL | typeof LENA | typeof PRIYA | typeof TOM | typeof JONAS | typeof TOMAS

export interface ApiPerson {
  id: PersonId
  name: string
  email: string
  image: string | null
}

export const PEOPLE: Record<PersonId, ApiPerson> = {
  [AMA]: { id: AMA, name: 'Ama Mensah', email: 'ama@acme.test', image: null },
  [DANIEL]: { id: DANIEL, name: 'Daniel Kim', email: 'daniel@acme.test', image: null },
  [LENA]: { id: LENA, name: 'Lena Ortiz', email: 'lena@acme.test', image: null },
  [PRIYA]: { id: PRIYA, name: 'Priya Shah', email: 'priya@acme.test', image: null },
  [TOM]: { id: TOM, name: 'Tom Becker', email: 'tom@acme.test', image: null },
  [JONAS]: { id: JONAS, name: 'Jonas Reed', email: 'jonas@acme.test', image: null },
  [TOMAS]: { id: TOMAS, name: 'Tomás Barros', email: 'tomas@bolt.test', image: null },
}

export const PERSON_IDS = Object.keys(PEOPLE) as PersonId[]
