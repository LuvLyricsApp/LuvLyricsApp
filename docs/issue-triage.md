# Issue Triage Guide

This guide helps maintainers and contributors manage issues consistently and efficiently.

The goal is to keep issue tracking simple, clear, and contributor-friendly.

---

# Label Dictionary

## bug
Used when something is broken, incorrect, or behaving unexpectedly.

Examples:
- App crashes
- UI not rendering properly
- Incorrect functionality

---

## enhancement
Used for improvements, optimizations, or new feature requests.

Examples:
- Performance improvements
- UX enhancements
- New functionality

---

## documentation
Used for documentation-related updates or fixes.

Examples:
- README improvements
- Missing setup instructions
- Typo corrections

---

## testing
Used for tasks related to tests and quality assurance.

Examples:
- Adding unit tests
- Improving test coverage
- Fixing failing tests

---

## security
Used for vulnerabilities, sensitive issues, or security-related improvements.

Examples:
- Secret exposure
- Authentication flaws
- Unsafe data handling

Avoid discussing sensitive vulnerabilities publicly. Follow `SECURITY.md`.

---

## good first issue
Beginner-friendly tasks suitable for first-time contributors.

These issues should:
- Have clear requirements
- Have limited scope
- Require minimal project context

---

## help wanted
Issues where maintainers are actively looking for community contributions.

These tasks may require:
- Additional feedback
- Investigation
- Contributor collaboration

---

## medium
Tasks with moderate complexity requiring some understanding of the codebase.

Examples:
- Refactoring small modules
- Improving existing features
- Adding non-trivial UI behavior

---

## hard
Complex tasks requiring deeper architectural or domain understanding.

Examples:
- Core system redesigns
- Multi-module changes
- Advanced optimization work

---

# Issue Triage Flow

When reviewing a new issue:

1. Read the issue carefully.
2. Check for duplicates or related issues.
3. Verify the issue is understandable and actionable.
4. Request clarification if information is missing.
5. Apply the appropriate labels.
6. Determine approximate difficulty and priority.
7. Assign the issue or mark it as ready for contributors.

Keep triage lightweight and practical.

---

# Priority Guidelines

## High Priority
Issues involving:
- Security vulnerabilities
- Crashes or data loss
- Broken core functionality

These should be escalated quickly.

---

## Medium Priority
Issues involving:
- Feature improvements
- Non-critical bugs
- Reliability improvements

---

## Low Priority
Issues involving:
- Minor UI adjustments
- Documentation updates
- Small cleanup tasks

---

# Escalation Guidance

Escalate issues immediately if they involve:
- Security concerns
- Sensitive credentials or secrets
- Data corruption or loss
- Major breaking regressions

Follow the responsible disclosure process described in `SECURITY.md`.

---

# Issue Quality Checklist

Before assigning or working on an issue, ensure it includes:

- Clear problem description
- Expected behavior
- Reproduction steps (if applicable)
- Relevant screenshots or logs
- Defined acceptance criteria
- Clear and limited scope

Well-written issues help contributors work more efficiently and reduce review overhead.