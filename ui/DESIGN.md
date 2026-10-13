# Relay

## Mission
Create implementation-ready, token-driven UI guidance for Relay that is optimized for consistency, accessibility, and fast delivery across marketing site.

## Brand
- Product/brand: Relay
- URL: https://relayfi.com/
- Audience: buyers, teams, and decision-makers
- Product surface: marketing site

## Style Foundations
- Visual style: clean, functional, implementation-oriented
- Main font style: `font.family.primary=BasisGrotesque`, `font.family.stack=BasisGrotesque`, `font.size.base=14px`, `font.weight.base=400`, `font.lineHeight.base=21px`
- Typography scale: `font.size.xs=11.76px`, `font.size.sm=12px`, `font.size.md=12.8px`, `font.size.lg=14px`, `font.size.xl=16px`, `font.size.2xl=18px`, `font.size.3xl=20px`, `font.size.4xl=22.11px`
- Color palette: `color.text.primary=#f8f6ed`, `color.surface.base=#000000`, `color.text.tertiary=#ffffff`, `color.text.inverse=#4d4747`, `color.surface.muted=#f4f1e7`, `color.surface.raised=#fffef7`, `color.surface.strong=#002813`
- Spacing scale: `space.1=2px`, `space.2=4px`, `space.3=6px`, `space.4=8px`, `space.5=10px`, `space.6=12px`, `space.7=16px`, `space.8=20px`
- Radius/shadow/motion tokens: `radius.xs=3.5px`, `radius.sm=8px`, `radius.md=9999.01px` | `shadow.1=rgba(0, 0, 0, 0.06) 0px 0px 0px 1px inset`, `shadow.2=rgba(0, 0, 0, 0.1) 0px 12px 30px 0px, rgba(0, 0, 0, 0.05) 0px 58px 44px -3px, rgba(0, 0, 0, 0.02) 0px 92px 50px -4px` | `motion.duration.instant=200ms`, `motion.duration.fast=300ms`, `motion.duration.normal=500ms`

## Accessibility
- Target: WCAG 2.2 AA
- Keyboard-first interactions required.
- Focus-visible rules required.
- Contrast constraints required.

## Writing Tone
Concise, confident, implementation-focused.

## Rules: Do
- Use semantic tokens, not raw hex values, in component guidance.
- Every component must define states for default, hover, focus-visible, active, disabled, loading, and error.
- Component behavior should specify responsive and edge-case handling.
- Interactive components must document keyboard, pointer, and touch behavior.
- Accessibility acceptance criteria must be testable in implementation.

## Rules: Don't
- Do not allow low-contrast text or hidden focus indicators.
- Do not introduce one-off spacing or typography exceptions.
- Do not use ambiguous labels or non-descriptive actions.
- Do not ship component guidance without explicit state rules.

## Guideline Authoring Workflow
1. Restate design intent in one sentence.
2. Define foundations and semantic tokens.
3. Define component anatomy, variants, interactions, and state behavior.
4. Add accessibility acceptance criteria with pass/fail checks.
5. Add anti-patterns, migration notes, and edge-case handling.
6. End with a QA checklist.

## Required Output Structure
- Context and goals.
- Design tokens and foundations.
- Component-level rules (anatomy, variants, states, responsive behavior).
- Accessibility requirements and testable acceptance criteria.
- Content and tone standards with examples.
- Anti-patterns and prohibited implementations.
- QA checklist.

## Component Rule Expectations
- Include keyboard, pointer, and touch behavior.
- Include spacing and typography token requirements.
- Include long-content, overflow, and empty-state handling.
- Include known page component density: links (83), cards (34), buttons (12), lists (9), navigation (3), inputs (1).


## Quality Gates
- Every non-negotiable rule must use "must".
- Every recommendation should use "should".
- Every accessibility rule must be testable in implementation.
- Teams should prefer system consistency over local visual exceptions.
