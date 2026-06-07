# Eva bilingual English support

Eva now detects whether the WhatsApp user is writing in Spanish or English and answers in that same language.

## Language detection

The helper `detectUserLanguage` uses deterministic rules, not OpenAI credits. It checks:

- Explicit instructions such as `answer in English` or `responde en espanol`.
- English phrases such as `where is`, `how can I`, `I need`, `what time`, `city hall`.
- Spanish phrases such as `donde queda`, `como hago`, `necesito`, `cual es`.
- Dominant words in mixed messages.

If the language is unclear, Eva defaults to Spanish.

## English replies

Eva has English base replies for greetings, thanks, unknown official information, out-of-scope questions, weather without real-time data, private services and citizen reports.

For example:

- `Where is the City Hall of Rionegro?`
- `What are the opening hours of City Hall?`
- `Is it raining in Rionegro?`
- `My cat is sick and I need a 24-hour vet.`

## Spanish knowledge used for English questions

The knowledge search now expands English terms into Spanish equivalents. Examples:

- `city hall` also searches `alcaldia` and `palacio municipal`.
- `opening hours` also searches `horario`.
- `property tax` also searches `predial`.
- `report an incident` also searches `reporte ciudadano` and `alerta`.

Eva can use a Spanish knowledge entry and adapt common official labels into English without changing sensitive data such as addresses, emails, phones, URLs or names.

## ElevenLabs voice

New variables:

```env
ELEVENLABS_VOICE_ID_ES=""
ELEVENLABS_VOICE_ID_EN="6rOxfAnZpbM3VIEhFaeV"
```

Compatibility:

- Spanish audio uses `ELEVENLABS_VOICE_ID_ES`.
- If `ELEVENLABS_VOICE_ID_ES` is empty, Spanish falls back to the existing `ELEVENLABS_VOICE_ID`.
- English audio uses `ELEVENLABS_VOICE_ID_EN`.
- If `ELEVENLABS_VOICE_ID_EN` is empty, English falls back to `6rOxfAnZpbM3VIEhFaeV`.

## Render configuration

In Render, add or confirm:

```env
ELEVENLABS_VOICE_ID_EN=6rOxfAnZpbM3VIEhFaeV
ELEVENLABS_VOICE_ID_ES=<current Spanish voice or leave empty if ELEVENLABS_VOICE_ID is set>
```

Keep the existing values for:

```env
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
WHATSAPP_AUDIO_REPLIES
WHATSAPP_SEND_TEXT_WITH_AUDIO
```

## How to test text in English

Send these WhatsApp messages:

```text
Where is the City Hall of Rionegro?
What are the opening hours of City Hall?
Is it raining in Rionegro?
My cat is sick and I need a 24-hour vet.
How can I report a pothole?
```

Expected behavior: Eva answers in English and does not invent official data.

## How to test English audio

1. Set `WHATSAPP_AUDIO_REPLIES=true`.
2. Set `ELEVENLABS_API_KEY`.
3. Set `ELEVENLABS_VOICE_ID_EN=6rOxfAnZpbM3VIEhFaeV`.
4. Send an English WhatsApp voice note or text message.
5. Check logs for:

```text
[eva] elevenlabs voice selected
```

The safe log includes the selected language and voice id.

## QA bilingual scenarios

The QA dashboard includes English cases for:

- City Hall location.
- City Hall opening hours.
- Weather.
- Private vet query.
- Accident report.
- Fallen tree report.
- How to report a pothole.
- Prompt injection refusal.
- Explicit English override.
- Explicit Spanish override.

## Limitations

- Eva does not translate every Spanish sentence perfectly without OpenAI.
- Deterministic translation focuses on common official labels and municipal questions.
- Addresses, emails, phone numbers, URLs and proper names are preserved.
- If official evidence is not enough, Eva says so in the user's language.
