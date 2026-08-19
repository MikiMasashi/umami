# Architecture Review US-201

## Result

Approved for test-first implementation.

## Review findings

| Area | Finding | Decision |
| --- | --- | --- |
| Testability contract | The contract fixes URL, DOM selectors, labels, messages, and HTTP responses only. | Accept. Child components and props remain implementation details. |
| UI integration | Notes belong in the existing website edit form and existing website list. | Accept. A separate notes page was rejected because it weakens the settings workflow. |
| Cache invalidation | Existing `websites` and `website:{websiteId}` modified keys cover list and detail refresh. | Accept. New cache channels are unnecessary. |
| XSS risk | Notes are plain text and must be escaped by normal React rendering. | Accept. Markdown/rich text is out of scope. |

## Concerns and mitigations

The project has two edit routes that reuse the same settings page. Tests cover the route-level settings entry point for component tests and the in-app settings route for E2E navigation, ensuring both externally relevant surfaces remain aligned without constraining internal component structure.
