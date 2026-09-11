import { describe, it, expect } from 'vitest'
import { PROGRAMMES, PLACES, islandForProgramme, rosterFaults, programmeById } from './roster'
import { MEMBER_ISLANDS, islandOfMap } from './member-islands'

describe('a member island shipped the documented way', () => {
  it('reports what the roster actually resolves', () => {
    console.log('MEMBER_ISLANDS:', JSON.stringify(MEMBER_ISLANDS))
    const g = programmeById('robotics')
    console.log('programme robotics:', JSON.stringify(g))
    console.log('place of it:', JSON.stringify(PLACES.find((p) => p.id === g?.place)))
    console.log('islandForProgramme(robotics):', JSON.stringify(islandForProgramme('robotics')))
    console.log('islandOfMap(robotics-a1):', JSON.stringify(islandOfMap('robotics-a1')))
    console.log('rosterFaults:', JSON.stringify(rosterFaults()))
    console.log('playable count:', PROGRAMMES.filter((p) => p.playable).length)
    expect(true).toBe(true)
  })
})
