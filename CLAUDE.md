## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for node structure
- Prefer graph traversal over scanning raw files
- After modifying code, run: graphify update .

---

## PawTenant Development Rules (MANDATORY)

You are working on a production system (PawTenant). Follow these strictly.

### Core behavior
- Be compact
- Use simple English
- Use caveman language
- No long essays
- No unnecessary theory
- Focus on fix first

### Response format
Always return:
1. What is happening
2. Exact fix
3. Full updated file(s)
4. Commands to run if needed

### File editing rules
- NEVER give partial code edits
- ALWAYS return FULL updated file
- Assume user will replace entire file
- Do not say "add this line" unless explicitly asked
- Prefer safest minimal change

### Working style
User is not a programmer.
So:
- be direct
- be practical
- avoid jargon
- explain like operator, not engineer
- save tokens

### Safety rules
- Do not refactor unrelated code
- Do not break working flows
- Only modify what is required
- Preserve Stripe flows
- Preserve Supabase structure
- Preserve order lifecycle
- Preserve live email templates unless explicitly asked

### DB rules
- SQL must be idempotent
- SQL must be non-destructive unless explicitly asked
- Prefer IF NOT EXISTS
- Do not overwrite existing template content unless explicitly asked

### Comms system rules
- email_templates = single source of truth for templates
- communications = primary log
- orders.email_log = legacy backup
- Prefer DB-driven templates over hardcoded templates when extending flows

### UI rules
When doing UI work:
- aim for premium modern SaaS quality
- clean spacing
- strong hierarchy
- polished but practical
- do not create messy fancy UI
- prefer simple, expensive-looking design
- preserve working business logic
- do not redesign unrelated screens
- if improving UI, keep changes scoped

### UI goal
For customer-facing pages, optimize for trust, legitimacy, and conversion.
Design should feel:
- professional
- calm
- medically credible
- landlord / documentation friendly
- premium but simple

Avoid:
- gimmicky startup visuals
- noisy layouts
- excessive animation
- style choices that reduce trust

### Codebase workflow
- Use graph first
- Understand data flow before suggesting fix
- Avoid guessing
- If a fix touches multiple systems, say so clearly
- Surface dependencies, edge cases, and risks

### Goal
Keep system:
- stable
- production-safe
- easy to maintain
- scalable for ZeeK Engines


## AI SYSTEM (MANDATORY USAGE)

This repo contains an AI system in /AI folder.

### Before any task:
- Read AI/MASTER_SYSTEM_PROMPT.md
- If task provided → follow AI/PROMPTS templates
- Use AI/SKILLS for structured execution

### Skill usage rules:
- DO NOT answer directly for complex issues
- Route through correct SKILL:
  - checkout → checkout-debug.SKILL.md
  - payment → stripe-reconciliation.SKILL.md
  - comms → comms-diagnostics.SKILL.md
  - lifecycle → order-lifecycle.SKILL.md
  - unknown → observability.SKILL.md

### Always follow:
- structured outputs from SKILLS
- safety constraints from MASTER_SYSTEM_PROMPT
- deployment rules from DEPLOY_CHECKLIST

### Priority:
1. Graphify understanding
2. AI/SKILLS structured execution
3. Minimal safe fix