# Development notes

## Large structured story generation

`LARGE_STRUCTURED_OUTPUT_PROVIDER` controls the provider used for complete
adventure-bible structured generation:

- `openai` — current development default.
- `sarvam` — intended production setting after upgrading the Sarvam plan.

Both provider paths deliberately generate the complete `GameBible` in one
structured response. This keeps the setting, NPC personalities, conversations,
clue facts, candidate locations, and ending authored as one connected story—the
proven flow from `main`.

Sarvam Starter limits `sarvam-105b` and `sarvam-30b` completions to 4,096 tokens.
Reasoning tokens also count toward that allowance, so a detailed multilingual JSON
response can be cut off before it closes. Development therefore uses OpenAI until
the Sarvam account has a higher output limit. There is no split-story fallback.

When the Sarvam plan is upgraded, set:

```env
LARGE_STRUCTURED_OUTPUT_PROVIDER=sarvam
SARVAM_STORY_MAX_TOKENS=16384
```

Then test custom-world generation in every supported language before using that
setting in production.
