/**
 * Skills System Type Definitions
 * Domain knowledge packages for AI agents
 */

/**
 * Skill location type - determines priority and editability
 */
export const SkillLocation = {
  PUBLIC: 'public',     // System built-in, read-only
  EXAMPLES: 'examples', // Examples, read-only
  USER: 'user',         // User created in app, read-write
  INSTALLED: 'installed' // Installed via npx skills add, stored in ~/.agents/skills
} as const

export type SkillLocation = typeof SkillLocation[keyof typeof SkillLocation]

/**
 * Skill priority order (higher number = higher priority)
 */
export const SKILL_PRIORITY: Record<SkillLocation, number> = {
  [SkillLocation.USER]: 4,
  [SkillLocation.INSTALLED]: 3,
  [SkillLocation.PUBLIC]: 2,
  [SkillLocation.EXAMPLES]: 1
}

/**
 * Skill validation constraints
 */
export const SKILL_CONSTRAINTS = {
  NAME_MAX_LENGTH: 64,
  NAME_PATTERN: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,  // lowercase, numbers, hyphens (no consecutive/leading/trailing)
  DESCRIPTION_MAX_LENGTH: 1024,
  DESCRIPTION_FORBIDDEN_CHARS: /[<>]/
} as const

/**
 * Parsed SKILL.md frontmatter
 */
export interface SkillFrontmatter {
  name: string           // Required: skill identifier
  description: string    // Required: skill description
  version?: string       // Optional: semantic version
  author?: string        // Optional: author name
  tags?: string[]        // Optional: search tags
  triggers?: string[]    // Optional: keywords that trigger skill loading
}

/**
 * Validation error for skill parsing
 */
export interface SkillValidationError {
  field: string
  message: string
  value?: any
}

/**
 * Validation result
 */
export interface SkillValidationResult {
  valid: boolean
  errors: SkillValidationError[]
}

/**
 * Raw skill data from file system
 */
export interface SkillMetadata {
  id: string              // Unique identifier (location-name)
  name: string            // Validated skill name
  description: string     // Validated description
  location: SkillLocation
  path: string            // Absolute path to skill directory
  enabled: boolean        // Whether skill is active
  createdAt: number
  updatedAt: number
  // Optional frontmatter fields
  version?: string
  author?: string
  tags?: string[]
  triggers?: string[]
  // Runtime state
  isLoaded?: boolean      // Whether body has been loaded
  hasError?: boolean
  errorMessage?: string
}

/**
 * Complete skill with body content (L2)
 */
export interface Skill extends SkillMetadata {
  body: string            // Markdown content (SKILL.md body)
}

/**
 * Skill with all assets (L3)
 */
export interface SkillFull extends Skill {
  scripts?: SkillScript[]
  references?: SkillReference[]
  assets?: SkillAsset[]
}

/**
 * Skill script definition
 */
export interface SkillScript {
  name: string
  path: string
  type: 'python' | 'javascript' | 'shell'
  description?: string
}

/**
 * Skill reference (external docs/links)
 */
export interface SkillReference {
  name: string
  type: 'url' | 'file'
  path?: string
  url?: string
}

/**
 * Skill asset (images, data files)
 */
export interface SkillAsset {
  name: string
  path: string
  type: string  // mime type or extension
}

/**
 * Skill registry stored in StorageService
 */
export interface SkillRegistry {
  skills: SkillMetadata[]
  activeSkillIds: string[]   // Currently enabled skills
  version: number
  lastUpdated: number
}

/**
 * Skill context for LLM injection
 */
export interface SkillContext {
  name: string
  description: string
  location: SkillLocation
}

/**
 * IPC result types
 */
export interface SkillScanResult {
  success: boolean
  skills: SkillMetadata[]
  errors: string[]
}

export interface SkillLoadResult {
  success: boolean
  skill?: Skill
  error?: string
}

export interface SkillCreateResult {
  success: boolean
  skill?: Skill
  error?: string
}

export interface SkillUpdateResult {
  success: boolean
  error?: string
}

export interface SkillDeleteResult {
  success: boolean
  error?: string
}
