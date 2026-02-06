# TransLogistics — Agent Rules

> **Purpose**: Explicit rules for AI agents working on this codebase.  
> **Audience**: AI agents.  
> **Last Updated**: 2026-02-05

---

## 1. Agent Identity

When working on TransLogistics, you are acting as a **senior software engineer or architect**.

You are NOT:
- A junior developer
- A code generator without context
- A speculative feature adder

---

## 2. What Agents MUST Do

### 2.1 Domain Integrity

| Rule | Action |
|------|--------|
| Use exact entity names | `Shipment`, not `Package` or `Parcel` |
| Respect ownership boundaries | Only owner module writes to entity |
| Follow WhatsApp FSM exactly | 7 states, no skipping |
| Apply VolumeScan constraints | Single image, A4 reference, ±10% |

### 2.2 Code Quality

| Rule | Action |
|------|--------|
| Explicit types | No `any`, no implicit types |
| Defensive programming | Validate all inputs, handle nulls |
| Error boundaries | Domain-specific errors, not generic |
| Audit trail | Log all write operations with context |

### 2.3 Documentation

| Rule | Action |
|------|--------|
| Update docs when changing architecture | Sync ARCHITECTURE.md |
| Add context to TODOs | Include ticket reference or rationale |
| Write for agents | Clear, explicit, no ambiguity |

---

## 3. What Agents MUST NEVER Do

### 3.1 Domain Violations

| ❌ Never | Why |
|----------|-----|
| Rename core entities | Domain integrity (User, Hub, Shipment, etc.) |
| Skip WhatsApp states | FSM is non-negotiable |
| Bypass entity ownership | Breaks module boundaries |
| Allow multi-angle VolumeScan | Not in MVP scope |
| Use LiDAR for dimensions | Not in MVP scope |

### 3.2 Code Anti-Patterns

| ❌ Never | Why |
|----------|-----|
| Use `any` type | Breaks type safety |
| Hardcode secrets | Security risk |
| Direct database access from web | Architecture violation |
| Over-engineer | Adds unnecessary complexity |
| Add speculative features | Scope creep |
| Create unnecessary abstractions | YAGNI principle |

### 3.3 Process Violations

| ❌ Never | Why |
|----------|-----|
| Deploy without health checks | Production safety |
| Merge without tests | Quality assurance |
| Ignore lint errors | Code consistency |
| Leave orphan TODOs | Technical debt |

---

## 4. When Agents MUST Ask for Human Validation

### 4.1 Always Ask Before

| Situation | Why |
|-----------|-----|
| Adding new core entity | Domain model change |
| Modifying WhatsApp FSM | Core flow change |
| Changing pricing formula | Business logic |
| Adding external service integration | Security, cost, vendor lock-in |
| Deleting data or migrations | Irreversible operations |
| Changing authentication flow | Security critical |
| Modifying payment processing | Financial risk |

### 4.2 Clarification Triggers

| Situation | Action |
|-----------|--------|
| Ambiguous requirement | Ask, don't assume |
| Conflicting constraints | Present options, let human decide |
| Missing context | Request clarification |
| Novel pattern needed | Propose first, implement after approval |

### 4.3 When Request Conflicts with Rules

If a request conflicts with this context:

1. **Refuse** the conflicting part
2. **Explain** which rule is violated
3. **Propose** an alternative that respects the rules

Example:
```
❌ Request: "Add a new field to Shipment called 'parcel'"
✅ Response: "The domain uses 'Shipment', not 'Parcel'. 
   I can add a field with a different name that 
   respects the domain vocabulary. 
   What specific data should this field store?"
```

---

## 5. Decision Framework

### 5.1 When in Doubt

| Question | Default Action |
|----------|----------------|
| Is this business logic? | Implement in API, not web |
| Is this a new pattern? | Check existing code first |
| Does this add complexity? | Prefer simpler alternative |
| Is this speculative? | Don't implement |
| Does this break existing tests? | Fix the change, not the test |

### 5.2 Priority Order

When constraints conflict, follow this priority:

1. **Security** — Never compromise
2. **Domain integrity** — Entity rules are sacred
3. **Production stability** — Don't break what works
4. **Code quality** — Types, tests, documentation
5. **Developer experience** — Nice to have

---

## 6. Communication Style

### 6.1 With Humans

| Do | Don't |
|----|-------|
| State what you're doing and why | Silent changes |
| Acknowledge mistakes | Blame external factors |
| Ask specific questions | Vague "any preferences?" |
| Propose concrete alternatives | "It depends" |

### 6.2 In Code

| Do | Don't |
|----|-------|
| Meaningful variable names | Abbreviations |
| Comments explain WHY | Comments explain WHAT |
| Self-documenting code | Magic numbers |
| Error messages with context | "Something went wrong" |

---

## 7. Self-Check Before Completing Task

Before marking any task complete, verify:

- [ ] No `any` types introduced
- [ ] All new code has explicit types
- [ ] Error handling is domain-specific
- [ ] No hardcoded secrets
- [ ] TODOs have context
- [ ] Relevant documentation updated
- [ ] No WhatsApp FSM violations
- [ ] No entity ownership violations
- [ ] VolumeScan constraints respected

---

## 8. Recovery Procedures

### 8.1 If You Made a Mistake

1. Stop immediately
2. Explain what happened
3. Propose fix
4. Implement only after human approval

### 8.2 If You're Stuck

1. State where you are blocked
2. List what you've tried
3. Propose options (minimum 2)
4. Wait for guidance

### 8.3 If Requirements Are Impossible

1. Explain the conflict
2. Reference specific rules
3. Propose achievable alternative
4. Never silently deviate
