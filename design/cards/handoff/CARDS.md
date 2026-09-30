# Sleepa Cards · Handoff (direction 1a Dark Chrome)

Reference design: `Sleepa Cards Set.dc.html`. Template PNGs in `templates/` are 2× (600×840) with a transparent photo window at x34 y98 w544 h376 r28 (1×: 17,49,272,188,r14).

## Card geometry (1×)
- Card 300×420 (5:7). Frame 3px conic foil. Outer radius 20, inner 17.
- Header padding 14/14/10: slot pill (12px/800, pos color on 13% alpha, pill radius), #num (12/600 #6E6E78), chips, stamp 22px.
- Photo window 272×188, radius 14, margin 0 14. Headshot height 176, bottom-aligned, centered. Glow = radial matchup color at 22%.
- Name 26/800, -0.02em, single line. Shrink: size = min(26, floor(268 / (chars × 0.64))), min 18, then ellipsis.
- Meta 13/500 #A1A1AA. Proj 46/800 -0.03em tabular. L3 20/700 #A1A1AA.
- Footer: set label 9/700 +0.14em uppercase #6E6E78; rarity mark right.
- Matchup bar 4px at the bottom edge.
- Mini (spread, phone): 173×242, frame 2px, radius 14, window 104px tall, name 16/800, proj 26/800.

## Colors (dark)
- Surfaces: bg #0B0B0D, surface #151518, surface-2 #1E1E22, surface-3 #29292F, hair rgba(255,255,255,.07)
- Text: #F5F5F7 / #A1A1AA / #6E6E78
- Matchup: favorable #3DD68C, neutral #FFB340, tough #FF5A4F
- Position: QB #6EA1FF, RB #3DD68C, WR #FFB340, TE #C58BFF, K #A1A1AA, DEF #5AD2F4, LB #E8B45A, FLEX = accent
- Q badge: 24px circle #FFB340, text #1a1206, 3px ring #151518, window top-right.

## Foil (CSS)
- base: `conic-gradient(from 220deg,#4a4a52 0%,#2a2a2f 30%,#5a5a62 55%,#232327 80%,#4a4a52 100%)`
- silver: `conic-gradient(from 220deg,#3a3a42 0%,#e9e9ec 12%,#6e6e78 24%,#b8b8c0 36%,#d9d9de 50%,#45454d 62%,#f4f4f5 76%,#8b8b95 88%,#3a3a42 100%)`
- gold: `conic-gradient(from 220deg,#5a3f10 0%,#f3d9a0 12%,#9A6B1E 26%,#fff3d6 42%,#A2670F 56%,#E8B45A 72%,#fff3d6 86%,#5a3f10 100%)`
- holo: `conic-gradient(from 200deg,#FF7EA8 0%,#FFB340 17%,#3DD68C 33%,#5AD2F4 50%,#6EA1FF 67%,#C58BFF 83%,#FF7EA8 100%)`
- moon: `conic-gradient(from 200deg,#2a2d52 0%,#c9ccf0 15%,#4a4f86 30%,#e9e9ec 48%,#2a2d52 62%,#aeb3e6 80%,#2a2d52 100%)`
- Holo window sheen: `linear-gradient(125deg,rgba(255,126,168,.22),rgba(255,179,64,.14) 30%,rgba(61,214,140,.14) 50%,rgba(90,210,244,.2) 70%,rgba(197,139,255,.22))`, mix-blend-mode: screen.
- Glare streak (all windows): `linear-gradient(115deg,transparent 35%,rgba(255,255,255,.07) 45%,transparent 55%)`.

## Shadows
- Card: 0 24px 60px rgba(0,0,0,.5). Holo adds 0 0 36px rgba(197,139,255,.28). Gold adds 0 0 28px rgba(232,180,90,.18).

## Tier rules (by projection rank within the lineup)
- Holo: #1. Gold: #2–4. Silver: #5–7. Base: rest.
- Moonlit replaces Silver/Base for Thu, Sun or Mon night games. Holo wins over Moonlit. Moonlit shows a serial chip (n/99).
- Rarity marks: Base ●, Silver ◆, Gold ★, Holo/Moonlit ☾.

## Inserts (stack with any tier)
- MVP / Full Art: last week's top scorer. Photo runs full-bleed to the frame (290px tall, fading to #151518).
- Relic: 30+ last week. 58px team-color striped swatch, dashed stitch, window bottom-right.
- Auto: beat projection 3 weeks straight. Caveat 700 42px signature in gold, rotated −7°.
- RC: rookie. Gold hex shield, window top-left.
- Misprint: under 60% of projection, only after lock. RGB-offset text-shadow and a red MISPRINT stamp.

## States
- Questionable: Q badge + amber injury line on back.
- Locked (game started): frame saturate(.35), headshot grayscale(1) brightness(.8), LOCKED chip with lock icon. Numbers keep full contrast.
- Empty: dashed 2px rgba(255,255,255,.18), pattern at 5%, "+ Add player".
- Missing photo: 112px initials monogram in the position color.
- DEF: team art replaces the photo. No injury badge.

## Back
- Crescent pattern: two radial-gradients, 34px tile (dot rgba(255,255,255,.07), cutout offset 62%/38%).
- Matchup block, stats grid (2 cols, 3 for DEF/IDP), typical-week range bar, injury line, "Full stats ›" pill, set label + stamp.

## Motion
- Flip: 560ms rotateY(180deg), cubic-bezier(.34,1.4,.5,1), backface-visibility hidden.
- Tilt-follow: pointer maps to rotateX/Y ±8°; foil conic angle = base + tiltX×4; the glare streak moves with the pointer.
- Deal-in: cards slide up 24px and fade in, 60ms stagger, cubic-bezier(.2,.8,.2,1). Special cards deal face-down, then flip with a foil sweep.
- Desktop hover: translateY(-14px) rotate(-1.5deg), deeper drop shadow.
- Deck: swipe with 0.72 scale neighbors at 45% opacity, ±4° rotation.
