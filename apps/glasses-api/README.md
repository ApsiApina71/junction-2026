---
status: draft
tags: [app, api, glasses]
last-updated: 2026-11-14
---

# glasses-api

The brain of an automatic calorie tracker for camera glasses (Junction 2026, Meta "AI Glasses for Everyone, Everyday" challenge). Linear project: TBD.

The glasses app sends what the wearer sees, one frame every few seconds. This API decides by itself when the wearer is eating, logs the meal once, keeps watching how much of it gets eaten, and returns a short sentence for the glasses to speak. The wearer never asks anything.

- `app/vision.py`: one model call per frame. It answers three things: is this the wearer's own food (not a shop shelf, not someone else's plate), what is on the plate with portions and nutrition, and, if a meal is already open, whether this is the same meal and how much of it is left.
- `app/tracker.py`: turns the stream of answers into a food log. A meal is logged after it has been seen twice within 30 seconds, so a glance does not count. While the meal is open, seeing it again only updates how much is left. When it closes (not seen for 20 minutes, or a different meal appears), leftovers are subtracted.
- `app/main.py`: the HTTP API, and a test page at `/`.
- `app/static/index.html`: the test page. It shows today's log, and it can send frames from the camera of the device it is open on.

## Status on 2026-11-14

The tracker logic and the API are covered by tests that use a stand-in for the model. The request the code sends to the model was checked against a local stand-in for the Messages API. **The live model call has not been run yet**, because the machine it was written on had no API key. The first run with a key is the first real test.

## Try it

```sh
cp .env.example .env        # then put ANTHROPIC_API_KEY in it
uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000
```

1. **On the laptop:** open `http://localhost:8000`, press "Start watching" and point the webcam at food, or press "Test with a photo".
2. **On a phone:** browsers open the camera only over https, so the phone needs a tunnel to the laptop, for example `cloudflared tunnel --url http://localhost:8000`. Set `API_TOKEN` in `.env` first and open `https://<tunnel>/?token=<API_TOKEN>`. With the glasses connected to the phone over Bluetooth, the spoken sentences come out of the glasses. The camera is still the phone's.
3. **From the glasses app:** see the next section. The test page shows the log while the glasses send the frames.

## Connecting the glasses app

Wherever the app receives a camera frame from the glasses, send it here every 2 to 3 seconds and speak the `say` field when it is not null. One request at a time: wait for the answer before sending the next frame.

```sh
curl -X POST "$BASE_URL/frames" -H "Content-Type: image/jpeg" -H "X-Api-Token: $API_TOKEN" --data-binary @frame.jpg
```

```json
{
  "event": "logged",
  "say": "Logged salmon soup and rye bread, about 460 calories. 460 today.",
  "scene": "my_food",
  "today": { "kcal": 460, "protein_g": 27, "carbs_g": 43, "fat_g": 19, "entries": [] }
}
```

`event` is one of `none`, `pending` (food seen once, not logged yet), `logged`, `updated` (the open meal was seen again), `closed` (a meal was closed with leftovers) and `busy` (the previous frame is still being analysed, this one was dropped).

Swift:

```swift
func send(frame: UIImage) async -> String? {
    guard let jpeg = frame.jpegData(compressionQuality: 0.7) else { return nil }
    var request = URLRequest(url: URL(string: "\(baseURL)/frames")!)
    request.httpMethod = "POST"
    request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
    request.setValue(apiToken, forHTTPHeaderField: "X-Api-Token")
    request.httpBody = jpeg
    guard let (data, _) = try? await URLSession.shared.data(for: request),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
    return json["say"] as? String   // speak it with AVSpeechSynthesizer
}
```

Kotlin (call it off the main thread):

```kotlin
fun send(frame: Bitmap): String? {
    val jpeg = ByteArrayOutputStream().also { frame.compress(Bitmap.CompressFormat.JPEG, 70, it) }.toByteArray()
    val connection = URL("$baseUrl/frames").openConnection() as HttpURLConnection
    connection.requestMethod = "POST"
    connection.doOutput = true
    connection.setRequestProperty("Content-Type", "image/jpeg")
    connection.setRequestProperty("X-Api-Token", apiToken)
    connection.outputStream.use { it.write(jpeg) }
    val json = JSONObject(connection.inputStream.bufferedReader().readText())
    return if (json.isNull("say")) null else json.getString("say")   // speak it with TextToSpeech
}
```

Phones refuse plain `http` to another machine by default, so give the app the https tunnel address.

## Other endpoints

| Endpoint | What it does |
|---|---|
| `GET /today` | Today's totals, a one-sentence `summary` to speak, and the entries |
| `GET /entries/{id}/image` | The picture of a logged meal |
| `DELETE /entries/{id}` | Remove a wrong entry. Returns the new totals |
| `GET /health` | `{"status": "ok", "model_id": ...}` |

When `API_TOKEN` is set, every endpoint except `/` and `/health` needs it, as the `X-Api-Token` header or a `?token=` query.

## Settings

All in `.env.example`. The ones that matter in a demo:

- `MODEL_ID`: `claude-sonnet-5-5` by default, as in the rest of the repo. Every frame is one model call with one or two images, so a long session adds up. `claude-haiku-5-5` is faster and much cheaper per frame; `claude-opus-5-5` estimates portions best.
- `SPEECH_LANGUAGE`: `en` or `fi`, for the spoken sentences and the food names.
- `CONFIRM_SIGHTINGS`: `1` logs on the first sighting. Quicker on stage, more false entries.
- `MEAL_GAP_SECONDS`: lower it to see the leftover correction without waiting 20 minutes.

## What is stored

One SQLite file (`data/glasses.db`, not in git) with the logged meals and one picture per meal, taken when the meal was logged. That picture is also what the model compares later frames with. Frames that do not start a meal are not stored. Removing an entry removes its picture.

## Differences from the `/new-app` template

- It calls the model through the Anthropic SDK, not Strands Agents: each frame is a single call with a fixed answer format, and there is no agent loop.
- The test page is a static file served by the API, not a separate web app.
