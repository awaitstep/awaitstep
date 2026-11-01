import type { AccessGiver } from '../../no-access-panel'

/** The AuditLog board's "Who can give you access". */
export const GIVERS: AccessGiver[] = [
  {
    person: {
      id: 'u-ama',
      name: 'Ama Mensah',
      email: 'ama@acme.test',
      initials: 'AM',
      image: null,
    },
    role: 'owner',
  },
  {
    person: {
      id: 'u-lena',
      name: 'Lena Ortiz',
      email: 'lena@acme.test',
      initials: 'LO',
      image: null,
    },
    role: 'admin',
  },
]
