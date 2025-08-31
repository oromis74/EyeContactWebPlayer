# EyeContactWebPlayer

**RU ниже | EN below**

## Описание

Веб‑плеер, который подключается к веб‑камере и ставит видео на паузу, если не все зрители смотрят на экран. Отслеживание ведётся локально в браузере с помощью MediaPipe Face Landmarker: вычисляется наклон головы (yaw/pitch), и при отклонении за порог плеер автоматически ставится на паузу.

**Ключевые возможности**

* Подключение к веб‑камере (без сервера, всё локально)
* Многолицевое отслеживание (несколько зрителей)
* Автопауза, если внимательных зрителей меньше ожидаемого числа
* Калибровка «все смотрят на экран»
* Настройка порогов yaw/pitch
* UI на React + React Bootstrap;

> ⚠️ Конфиденциальность: видеопоток обрабатывается локально, но попросите согласие пользователей на использование камеры.

---

## 🚀 Быстрый старт (Dev)

**Требования:** Node.js **20.19+** или **22.12+**

```bash
npm i
npm run dev
```

Откройте `http://localhost:5173`, разрешите доступ к камере, загрузите видео (URL или файл), нажмите «Калибровка», затем «Старт мониторинга».

### Путь до модели

По умолчанию в коде используется облачный путь к модели:

```js
const modelAssetPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
```

Для офлайн‑режима положите модель в `public/models/face_landmarker.task` и замените путь на:

```js
const modelAssetPath = "/models/face_landmarker.task";
```



> Камера не будет работать при открытии `dist/index.html` через `file://` — нужен **HTTP** (например, `vite preview` или `npx serve dist`).

---

## 🔧 Траблшутинг

* **Vite ругается на Node:** поставьте Node 20.19+ или 22.12+ (на Windows удобно через nvm-windows).
* **404 на модели:** используйте локальный путь `/models/face_landmarker.task` и положите файл в `public/models`.
* **Камера не работает:** проверьте, что открываете по HTTP/HTTPS, а не `file://`; разрешите доступ к камере в браузере/системе.

---

## 📄 Лицензия


---

## English

### Description

A web video player that connects to the webcam and **auto‑pauses** the movie if not everyone is looking at the screen. All processing happens locally in the browser using MediaPipe Face Landmarker. We estimate head pose (yaw/pitch) and compare it against thresholds.

**Features**

* Local webcam processing (no backend)
* Multi‑face tracking
* Auto‑pause when attentive viewers drop below expected count
* One‑click calibration
* Adjustable yaw/pitch thresholds
* React + React Bootstrap UI; webcam preview can be toggled

### Quick Start (Dev)

**Requires:** Node.js **20.19+** or **22.12+**

```bash
npm i
npm run dev
```

Open `http://localhost:5173`, allow camera, load a video, calibrate, then start monitoring.

**Model path**
Cloud (default):

```js
const modelAssetPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
```

Offline:

```js
const modelAssetPath = "/models/face_landmarker.task"; // put file under public/models
```

**Build (SPA)**

```bash
npm run build
npm run preview   # serves over HTTP (required for camera)
```

> If using a local model, set `modelAssetPath = "/models/face_landmarker.task"` and include it via `extraResources`.


**Notes**

* Camera requires HTTP/HTTPS (no `file://`).
* Use local model path if the network blocks GCS.

