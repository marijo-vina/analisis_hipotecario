# PFAE Git Branching and Merge Workflow Rules

This rule applies to all agent conversations working on the PFAE profile or feature branches in this repository.

## 1. Branching Hierarchy
- `main`: Production branch (Salariados profile). MUST NEVER be modified directly, merged into, or pushed to without explicit user order.
- `feature/perfil-pfae`: Integration branch for the PFAE profile (the "epic" / "integration main" for PFAE).
- Sub-branches per HU: `feature/pfae-hu-XX-[description]` created from `feature/perfil-pfae`.

## 2. Commit & Merge Protocol
- **No Push Policy**: NEVER execute `git push`. All commits are local.
- **HU Isolation**: Work for each HU happens strictly in its dedicated sub-branch `feature/pfae-hu-XX-[description]`.
- **Merge Approval**: Do NOT merge a HU sub-branch into `feature/perfil-pfae` until the user explicitly completes manual testing and gives explicit approval.
- **Main Protection**: Merge from `feature/perfil-pfae` to `main` happens ONLY when the full PFAE roadmap is 100% completed and approved.
