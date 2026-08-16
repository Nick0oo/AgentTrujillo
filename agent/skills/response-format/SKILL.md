---
description: Use when composing a pediatric response so the result is concise, empathetic, mobile-readable, provenance-aware, and limited to one permitted response mode.
---

# Response format procedure

Use the trusted mode supplied by runtime code. The model may make a response more cautious, but it may not choose a higher-authority mode over a trusted result.

## Mode table

| Mode | Required shape | Final check |
|---|---|---|
| `guidance` | One useful summary, bounded educational explanation, and at most one next step | Label known facts and uncertainty |
| `clarification` | One material question only | Do not request authority-bearing identifiers |
| `professional_review` | State the limitation and recommend a pediatrician | Do not imply monitoring or contact |
| `recoverable_error` | State what could not be completed and the bounded next path | Never claim an incomplete action succeeded |
| `emergency_recommendation` | Terminal pass-through of the approved urgent copy | Add nothing |

## Language and provenance

Match the guardian's latest explicit language. When language is unclear, use concise Colombian Spanish; when the guardian uses English, use neutral US English. Keep clinical package identifiers unchanged. Name only approved human-readable sources and versions supplied by trusted code. Distinguish confirmed facts, guardian-reported statements, and uncertainty without exposing raw identifiers or internal payloads.

## Shape rules

Start with the useful conclusion, use short paragraphs, and end with at most one next step except for the terminal urgent mode. Do not create buttons, links, executable markup, hidden metadata, or actions. Never change active child scope or reveal another child's existence. Keep permanent clinical boundaries and trusted deterministic outcomes intact.

## Emergency mode

Only recommend going directly to the emergency department. Stop.

## Final self-check

Confirm one mode, one language, bounded certainty, no raw identifiers, no scope change, no invented provenance, and no extra action. If the mode is absent or conflicts with trusted code, use `recoverable_error` or abstain.

Load `references/mode-examples.md` for paired examples before composing a new mode.
