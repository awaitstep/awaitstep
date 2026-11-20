// Imported by a workflow, a Function or another module as:
//   import { scoreLead } from '#modules/lead-scoring'

export interface Lead {
  email: string
  companySize: number
  country: string
}

export interface LeadScore {
  score: number
  band: 'hot' | 'warm' | 'cold'
  reasons: string[]
}

export function scoreLead(lead: Lead): LeadScore {
  const reasons: string[] = []
  let score = 0

  if (lead.companySize >= 200) {
    score += 40
    reasons.push('company has 200+ people')
  } else if (lead.companySize >= 50) {
    score += 25
    reasons.push('company has 50+ people')
  }

  if (lead.country === 'NL') {
    score += 20
    reasons.push('based in the Netherlands')
  }

  if (lead.email.endsWith('.gov')) {
    score += 10
    reasons.push('public-sector address')
  }

  const bounded = Math.min(100, score)
  return {
    score: bounded,
    band: bounded >= 60 ? 'hot' : bounded >= 30 ? 'warm' : 'cold',
    reasons,
  }
}
