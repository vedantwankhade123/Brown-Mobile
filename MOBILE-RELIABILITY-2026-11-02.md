# Mobile essentials: chat reliability and recovery

This batch targets dependable existing behavior before adding more app sections.

- A synchronous send lock covers session creation, message saving, memory handling and inference, preventing rapid taps from starting overlapping work.
- Preparation, token, completion and navigation callbacks use request epochs so an old request cannot paint another chat. Model switches cancel active work; a cancelled native warm-up cannot start a later completion.
- A serialized AsyncStorage journal keeps the original request and bounded partial-response checkpoints (one-second cadence), flushing when the app backgrounds or unmounts. Restart recovery never resends a network or inference request automatically. Empty interrupted requests restore the user message and a Retry notice; useful partial text is retained.
- Retry reuses the last user request and a stable assistant ID. Request-specific checkpoint identities prevent an old save from clearing a newer retry. Reply saves are serialized and do not recreate deleted sessions.
- Stop retains useful partial text, removes empty placeholders, and offers Retry. A six-minute response deadline ends indefinite loading. This is not an assurance Android will run inference indefinitely in the background.
- Errors are presented separately from assistant answers. Native SQLite opening/migration/query/write errors are surfaced instead of silently switching to volatile memory. Web/test simulation can still use the memory driver.
- A compact composer label distinguishes **On this phone · Offline**, **Desktop · Connected/Unavailable**, and **Cloud · Internet required**. Tapping it explains requirements or opens desktop connection. A connected desktop is not required for a downloaded phone model.
- Desktop inference forwards cancellation through legacy HTTP and encrypted companion direct/relay requests; cancelled work cannot deliver a late answer into the UI. Cancellation does not claim that every remote server has stopped computing.

Verification includes TypeScript, mobile unit/UI suites, `tests/chat-reliability.test.cjs`, and a signed ARM64 build installed over the existing app using `adb install -r`. No data-clear or uninstall step is used. The local test build retains version 1.0.7/build 19 and has not been published as a new release.

Remaining separate work includes broader attachment parsing/camera capture, mobile project workspaces and RAG, an assets gallery, and dedicated storage management. These are not claimed complete by this reliability batch.

Physical-device check: Samsung Galaxy A35 (SM-A356E), USB debugging, existing signed install upgraded in place. The on-device/offline label rendered correctly; rapid double-tapping sent one user message. A normal on-device request produced and saved a response. Force-stopping 2.2 seconds after a longer request, then reopening, restored its user message with **Reply interrupted before any output** and Retry. Retry followed by Stop kept one user-message occurrence and displayed the stopped-state notice. A subsequent retry generated a longer response. Partial checkpoint persistence and same-answer retry isolation are covered by automated tests; a mid-token force-stop recovery was not conclusively observed on the device. The temporary USB stay-awake setting was restored to its original value, 0. Existing app data was not cleared, and test conversations were retained in history.
