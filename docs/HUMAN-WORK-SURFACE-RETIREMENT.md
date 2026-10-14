# Human Work Model — Wave 6 Surface Retirement

## 10.95.0

Wave 6 makes the Human Working Platform surface model permanent. Duplicate operational destinations no longer render duplicate screens. They resolve to the canonical Human Work destinations or to the canonical Account activation context.

### Canonical Operations Plane

```text
TODAY → what matters
WORK → what needs doing
NETWORK → collaboration
OBJECTS → operational objects
PEOPLE → people and responsibility
ACCOUNT → identity, readiness, billing, privacy and security
```

### Permanently retired operational surfaces

- Missions page → Work
- Assignments / execution / role workspace → Work
- Executor / driver dashboard → Work
- My Driver → People
- Company access → Account
- Verification → Account Activation Context
- Subscription / billing → Account Activation Context
- Legacy admin routes → canonical entry / Control Plane routing

These files are compatibility redirects only; they contain no duplicate operational UI.

### Necessary separate journeys

The following remain because they serve a distinct stage rather than duplicating authenticated Work:

- login / registration / password recovery
- independent executor registration
- invitation acceptance
- private mission access (ForYou)
- support
- developer
- public status
- Control Plane

### Architectural rule

Surface retirement changes presentation and routing, not domain authority. Mission, Assignment, Network, People, Object, Product, Policy, Subscription and security authorities remain canonical underneath the Human Work Model.

### Final target

**One human operating system. Many canonical authorities. Zero duplicate operational destinations.**
