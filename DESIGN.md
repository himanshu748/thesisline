# ThesisLine design

## Direction

A quiet research desk: warm paper, clear editorial typography, and a restrained blue for actions and focus. The interface prioritizes a user's question, the exact source language, and what remains unknown. It avoids price-terminal conventions, decorative stock charts, fabricated performance metrics, and generic feature-card grids.

## Foundations

- Background: warm paper `#f8f7f3`.
- Primary text: ink `#202a36`.
- Interactive accent: blue `#304d70`.
- Display and quotation face: self-hosted Newsreader.
- Body and interface face: self-hosted DM Sans.
- Long text stays at readable line lengths; borders organize source material without heavy card decoration.

## Public landing

The hero pairs a large editorial headline with a small, slightly rotated research note. The note poses an INFY question without asserting a fact. An interactive Northstar Technologies example lets visitors select three fictional disclosures and see how the source, interpretation, and unknowns change together. The example is explicitly labeled fictional and its readings illustrative.

The final section states current coverage, capture limits, privacy, and alert requirements in compact prose. Public navigation leads to the example, sign-in, or the authenticated workspace. No false source links are used.

## Interaction and accessibility

All example events are native buttons with pressed state, visible focus, and descriptive labels. Content changes are announced politely. The layout stacks naturally at 390px, with no horizontal page scroll. Motion is brief and disabled for reduced-motion preferences. The source text remains available without animation or hover.

## Ownership

Landing-specific selectors use the `tl-` prefix. The application supplies shared Brand and button primitives, fonts, and workspace styles. Product claims are limited to the approved scope; deployment and real-provider receipts are separate verification artifacts.
