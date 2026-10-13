# Linux kernel defensive security review

Goal: perform static source review and report plausible defects without executing suspect code.

## Workflow
1. Establish subsystem, call path, configuration guards, and relevant data/control-flow.
2. Trace user-controlled inputs into allocations, copies, indexing, refcounts, locks, and privileged operations.
3. Look for out-of-bounds access, integer overflow, use-after-free, double free, refcount errors, missing validation, TOCTOU, race conditions, lock-order problems, and permission checks.
4. Check error paths and lifetime rules; compare similar call sites and existing fixes when source is available.
5. Report only evidence-backed candidates. Separate confirmed facts from hypotheses and false-positive risks.

## Output
For each finding include file/function/line if known, preconditions, exact code evidence, impact, confidence, and a minimal defensive patch idea. Recommend regression tests or static checks.

## Safety
Static analysis only. Do not run the kernel code or produce exploit payloads, weaponized exploit chains, or instructions for attacking live systems. Do not label a suspicion a confirmed vulnerability without validation.