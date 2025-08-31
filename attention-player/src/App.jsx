import React, { useEffect, useRef, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import { Container, Row, Col, Card, Button, Form, Badge, Alert, ProgressBar, Stack } from "react-bootstrap";
import { Camera, Play, Pause, Eye as EyeIcon, Users as UsersIcon, Settings as SettingsIcon, Link as LinkIcon, Film as FilmIcon, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ATTENTION-AWARE VIDEO PLAYER — React Bootstrap Layout
// Доп. пакеты: npm i react-bootstrap bootstrap lucide-react framer-motion
// Основные фичи без изменений, но интерфейс перестроен:
//  - Плеер в центре страницы
//  - Кнопки и статус — единым блоком ПОД плеером
//  - Превью камеры — СВЕРХУ СПРАВА + переключатель показа (чекбокс)

export default function App() {
    const filmRef = useRef(null);
    const camRef = useRef(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [monitoring, setMonitoring] = useState(false);
    const [calibrated, setCalibrated] = useState(false);
    const [expectedCount, setExpectedCount] = useState(0);
    const [faceCount, setFaceCount] = useState(0);
    const [attentiveCount, setAttentiveCount] = useState(0);
    const [status, setStatus] = useState("Готово");
    const [yawThreshold, setYawThreshold] = useState(20); // degrees
    const [pitchThreshold, setPitchThreshold] = useState(15); // degrees
    const [baselineYaw, setBaselineYaw] = useState(0);
    const [baselinePitch, setBaselinePitch] = useState(0);
    const [faceLandmarker, setFaceLandmarker] = useState(null);
    const [attentionScore, setAttentionScore] = useState(0); // %
    const [autoPaused, setAutoPaused] = useState(false);
    const [showPreview, setShowPreview] = useState(true);
    const [graceMs, setGraceMs] = useState(1000); // допуск отвлечения в мс
    const userPausedRef = useRef(false); // пользовательская пауза во время мониторинга
    const programmaticPauseRef = useRef(false); // чтобы различать autoPause vs user pause
    const awaySinceRef = useRef(null); // когда началось отвлечение
    const rAF = useRef(0);
    const lastDetTime = useRef(0);
    const monitoringRef = useRef(false);
    useEffect(() => { monitoringRef.current = monitoring; }, [monitoring]);

    // --- Load MediaPipe FaceLandmarker ---
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const vision = await import("@mediapipe/tasks-vision");
                const { FilesetResolver, FaceLandmarker } = vision;
                const wasmBase = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
                const filesetResolver = await FilesetResolver.forVisionTasks(wasmBase);
                const modelAssetPath = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"; // или "/models/face_landmarker.task"
                const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
                    baseOptions: { modelAssetPath },
                    numFaces: 10,
                    runningMode: "VIDEO",
                    outputFaceBlendshapes: true,
                    outputFacialTransformationMatrixes: true,
                });
                if (!cancelled) setFaceLandmarker(landmarker);
            } catch (e) {
                console.error(e);
                setStatus("Не удалось загрузить модель распознавания лиц. Проверьте интернет.");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // --- Start camera ---
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
            if (camRef.current) {
                camRef.current.srcObject = stream;
                await camRef.current.play();
                setCameraReady(true);
                setStatus("Камера запущена");
            }
        } catch (e) {
            console.error(e);
            setStatus("Доступ к камере отклонён или камера недоступна");
        }
    };

    // --- Helpers: matrix -> yaw/pitch/roll in degrees ---
    const toEuler = (m) => {
        const d = m.data || m; // 4x4 row-major
        const r00 = d[0], r01 = d[1], r02 = d[2];
        const r10 = d[4], r11 = d[5], r12 = d[6];
        const r20 = d[8], r21 = d[9], r22 = d[10];
        const sy = Math.hypot(r00, r10);
        let x, y, z;
        if (sy > 1e-6) {
            x = Math.atan2(r21, r22);       // pitch (X)
            y = Math.atan2(-r20, sy);       // yaw (Y)
            z = Math.atan2(r10, r00);       // roll (Z)
        } else {
            x = Math.atan2(-r12, r11);
            y = Math.atan2(-r20, sy);
            z = 0;
        }
        const rad2deg = 180 / Math.PI;
        return { pitch: x * rad2deg, yaw: y * rad2deg, roll: z * rad2deg };
    };

    // --- Core detection loop ---
    const step = () => {
        if (!camRef.current || !faceLandmarker) return;
        const now = performance.now();
        if (now - lastDetTime.current < 90) {
            rAF.current = requestAnimationFrame(step);
            return;
        }
        lastDetTime.current = now;

        const res = faceLandmarker.detectForVideo(camRef.current, now);
        const faces = res?.facialTransformationMatrixes || [];
        setFaceCount(faces.length);

        let attentive = 0;
        let yawSum = 0, pitchSum = 0;
        faces.forEach((mat) => {
            const { yaw, pitch } = toEuler(mat);
            yawSum += yaw; pitchSum += pitch;
            const dy = Math.abs(yaw - baselineYaw);
            const dp = Math.abs(pitch - baselinePitch);
            if (dy <= yawThreshold && dp <= pitchThreshold) attentive += 1;
        });

        setAttentiveCount(attentive);

        const film = filmRef.current;
        const expected = expectedCount > 0 ? expectedCount : faces.length;
        const score = expected ? Math.round((attentive / expected) * 100) : 0;
        setAttentionScore(score);

        if (monitoringRef.current && film) {
            const needsPause = expected > 0 ? attentive < expected : attentive < faces.length;

            if (needsPause) {
                if (awaySinceRef.current == null) awaySinceRef.current = now;
                const elapsed = now - awaySinceRef.current;
                if (elapsed >= graceMs) {
                    if (!film.paused) { programmaticPauseRef.current = true; film.pause(); }
                    setAutoPaused(true);
                    setStatus(
                        faces.length === 0
                            ? "Лица не обнаружены — пауза"
                            : `Внимательных: ${attentive}/${expected} — пауза`
                    );
                } else {
                    const wait = Math.max(0, Math.ceil(graceMs - elapsed));
                    setStatus(`Отвлеклись: пауза через ${wait / 1000} Сек. (${attentive}/${expected})`);
                }
            } else {
                awaySinceRef.current = null;
                setAutoPaused(false);
                if (!userPausedRef.current) {
                    if (film.paused) film.play().catch(() => {});
                    setStatus(`Все смотрят (${attentive}/${expected}) — воспроизведение`);
                } else {
                    setStatus("Пауза пользователем — мониторинг активен");
                }
            }
        }

        rAF.current = requestAnimationFrame(step);
    };

    const startMonitoring = () => {
        if (!cameraReady || !faceLandmarker) {
            setStatus("Сначала запустите камеру и дождитесь загрузки модели");
            return;
        }
        if (!calibrated) setStatus("Совет: выполните калибровку для точности (но можно и без неё)");
        setMonitoring(true);
        cancelAnimationFrame(rAF.current);
        rAF.current = requestAnimationFrame(step);
    };

    const stopMonitoring = () => {
        setMonitoring(false);
        setAutoPaused(false);
        cancelAnimationFrame(rAF.current);
        setStatus("Мониторинг остановлен");
    };

    const calibrate = () => {
        if (!camRef.current || !faceLandmarker) return;
        const now = performance.now();
        const res = faceLandmarker.detectForVideo(camRef.current, now);
        const faces = res?.facialTransformationMatrixes || [];
        if (!faces.length) {
            setStatus("Калибровка не удалась: лиц не видно");
            return;
        }
        let yawSum = 0, pitchSum = 0;
        faces.forEach((m) => { const { yaw, pitch } = toEuler(m); yawSum += yaw; pitchSum += pitch; });
        const yawAvg = yawSum / faces.length;
        const pitchAvg = pitchSum / faces.length;
        setBaselineYaw(yawAvg);
        setBaselinePitch(pitchAvg);
        if (expectedCount === 0) setExpectedCount(faces.length);
        setCalibrated(true);
        setStatus(`Калибровка готова • yaw=${yawAvg.toFixed(1)}°, pitch=${pitchAvg.toFixed(1)}° • зрителей: ${expectedCount || faces.length}`);
    };

    // --- Cleanup on unmount ---
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rAF.current);
            const stream = camRef.current?.srcObject;
            if (stream) stream.getTracks().forEach((t) => t.stop());
        };
    }, []);

    // --- Global page styles to avoid white stripe on the right ---
    useEffect(() => {
        const prevHtmlBg = document.documentElement.style.backgroundColor;
        const prevBodyBg = document.body.style.backgroundColor;
        const prevBodyOverflowX = document.body.style.overflowX;
        document.documentElement.style.backgroundColor = '#0b0f19';
        document.body.style.backgroundColor = '#0b0f19';
        document.body.style.overflowX = 'hidden';
        return () => {
            document.documentElement.style.backgroundColor = prevHtmlBg;
            document.body.style.backgroundColor = prevBodyBg;
            document.body.style.overflowX = prevBodyOverflowX;
        };
    }, []);

    // --- UI helpers ---
    const onPickFile = (e) => {
        const file = e.target.files?.[0];
        if (!file || !filmRef.current) return;
        const url = URL.createObjectURL(file);
        filmRef.current.src = url;
        filmRef.current.play().catch(() => {});
    };

    const onSetUrl = (e) => {
        e.preventDefault();
        const url = new FormData(e.currentTarget).get("videoUrl");
        if (!url || !filmRef.current) return;
        filmRef.current.src = url;
        filmRef.current.play().catch(() => {});
    };

    // --- Video event handlers to respect user pause during monitoring ---
    const handleFilmPause = () => {
        if (programmaticPauseRef.current) { programmaticPauseRef.current = false; return; }
        if (monitoringRef.current) {
            userPausedRef.current = true;
            setStatus("Пауза пользователем — мониторинг активен");
        }
    };
    const handleFilmPlay = () => {
        userPausedRef.current = false;
    };

    return (
        <div className="bg-dark text-light min-vh-100 py-3" style={{ overflowX: 'hidden' }}>
    <style>{`
        html, body, #root { height:100%; background:#0b0f19; }
        body { margin:0; overflow-x:hidden; }
      `}</style>
    <Container fluid>
        {/* Верхняя строка: превью камеры СВЕРХУ СПРАВА */}
        <Row className="g-3 justify-content-end">
        <Col xs={12} md={6} lg={4} className="d-flex">
            <Card bg="dark" text="light" className="w-100 border-secondary shadow-sm">
                <Card.Header className="d-flex align-items-center justify-content-between">
                    <div className="d-flex align-items-center gap-2">
                        <Camera size={18} /> <span>Превью камеры</span>
                    </div>
                    <Form.Check
                        type="switch"
                        id="toggle-preview"
                        label="Показывать"
                        checked={showPreview}
                        onChange={(e) => setShowPreview(e.target.checked)}
                    />
                </Card.Header>
                <Card.Body className="p-0 position-relative">
                    {showPreview ? (
                        <div className="ratio ratio-16x9 bg-black">
                            <video ref={camRef} className="w-100 h-100" playsInline muted />
                        </div>
                    ) : (
                        <div className="p-4 text-secondary">Превью скрыто</div>
                    )}
                </Card.Body>
                <Card.Footer className="text-muted small">{cameraReady ? "Камера активна" : "Камера выключена"}</Card.Footer>
            </Card>
        </Col>
    </Row>

    {/* Центральный ряд: ПЛЕЕР по центру */}
    <Row className="g-4 justify-content-center mt-1">
    <Col xs={12} md={10} lg={8}>
        <Card bg="dark" text="light" className="border-secondary shadow-lg">
        <Card.Body className="p-0 position-relative">
        <div className="ratio ratio-16x9 bg-black position-relative">
        <video ref={filmRef} className="w-100 h-100" controls playsInline onPause={handleFilmPause} onPlay={handleFilmPlay} />

    {/* Оверлей паузы */}
    <AnimatePresence>
        {autoPaused && monitoring && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="position-absolute top-0 start-0 end-0 bottom-0 d-flex align-items-center justify-content-center bg-dark bg-opacity-75"
            >
                <div className="text-center">
                    <div className="mx-auto mb-3 d-flex align-items-center justify-content-center rounded-circle" style={{ width: 64, height: 64, background: "rgba(255,255,255,0.1)" }}>
                        <Pause size={28} />
                    </div>
                    <div className="h5 mb-1">Пауза: не все смотрят</div>
                    <div className="text-secondary small">Как только все повернутся к экрану, воспроизведение продолжится</div>
                </div>
            </motion.div>
        )}
    </AnimatePresence>
</div>
</Card.Body>

    {/* БЛОК ПОД ПЛЕЕРОМ: статус + кнопки + источники */}
    <Card.Body className="pt-3">
        <Stack gap={3}>
            <div className="d-flex flex-wrap align-items-center gap-2">
                {autoPaused ? (
                    <Badge bg="warning" text="dark" className="me-2"><AlertTriangle size={14} className="me-1"/>Пауза</Badge>
                ) : (
                    <Badge bg="success" className="me-2"><CheckCircle2 size={14} className="me-1"/>Готово</Badge>
                )}
                <span className="text-secondary small">{status}</span>
            </div>

            <div className="d-flex flex-wrap gap-2">
                {!monitoring ? (
                    <Button variant="success" onClick={startMonitoring}><Play size={16} className="me-2"/>Старт мониторинга</Button>
                ) : (
                    <Button variant="danger" onClick={stopMonitoring}><Pause size={16} className="me-2"/>Стоп мониторинга</Button>
                )}
                <Button variant="primary" onClick={startCamera}><Camera size={16} className="me-2"/>{cameraReady ? "Перезапустить камеру" : "Подключить камеру"}</Button>
                <Button variant="warning" onClick={calibrate}><SettingsIcon size={16} className="me-2"/>Калибровка</Button>
            </div>

            {/* Источники видео */}
            <Form onSubmit={onSetUrl} className="d-flex gap-2">
                <div className="flex-grow-1">
                    <Form.Control name="videoUrl" placeholder="Вставьте URL видео (MP4/HLS)" />
                </div>
                <Button variant="outline-light"><LinkIcon size={16} className="me-2"/>Загрузить URL</Button>
            </Form>

            <div>
                <Form.Label className="me-2"><FilmIcon size={16} className="me-2"/>Файл</Form.Label>
                <Form.Control type="file" accept="video/*" onChange={onPickFile} />
            </div>

            {/* Метрики */}
            <Row className="g-3">
                <Col xs={6} md={4}>
                    <Card bg="dark" text="light" className="border-secondary h-100">
                        <Card.Body>
                            <div className="text-secondary small">Обнаружено лиц</div>
                            <div className="h4 mb-0 d-flex align-items-center"><UsersIcon size={18} className="me-2"/> {faceCount}</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={6} md={4}>
                    <Card bg="dark" text="light" className="border-secondary h-100">
                        <Card.Body>
                            <div className="text-secondary small">Внимательных</div>
                            <div className="h4 mb-0 d-flex align-items-center"><EyeIcon size={18} className="me-2"/> {attentiveCount}</div>
                        </Card.Body>
                    </Card>
                </Col>
                <Col xs={12} md={4}>
                    <Card bg="dark" text="light" className="border-secondary h-100">
                        <Card.Body>
                            <div className="text-secondary small mb-1">Индекс внимания</div>
                            <ProgressBar now={attentionScore} label={`${attentionScore}%`} />
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            {/* Настройки */}
            <Row className="g-3">
                <Col md={6}>
                    <Card bg="dark" text="light" className="border-secondary h-100">
                        <Card.Body>
                            <div className="d-flex align-items-center gap-2 mb-2"><SettingsIcon size={16}/> Параметры детекции</div>
                            <Form.Label className="small">Порог yaw (°): {yawThreshold}</Form.Label>
                            <Form.Range min={5} max={45} value={yawThreshold} onChange={(e) => setYawThreshold(parseInt(e.target.value))} />
                            <Form.Label className="small mt-2">Порог pitch (°): {pitchThreshold}</Form.Label>
                            <Form.Range min={5} max={45} value={pitchThreshold} onChange={(e) => setPitchThreshold(parseInt(e.target.value))} />
                            <Form.Label className="small mt-2">Допустимая задержка отвлечения: {graceMs / 1000} Сек</Form.Label>
                            <Form.Range min={0} max={15} step={1} value={graceMs / 1000} onChange={(e) => setGraceMs(parseInt(e.target.value) * 1000)} />
                        </Card.Body>
                    </Card>
                </Col>
                <Col md={6}>
                    <Card bg="dark" text="light" className="border-secondary h-100">
                        <Card.Body>
                            <div className="text-secondary small">База калибровки</div>
                            <div className="mb-2">yaw: {baselineYaw.toFixed(1)}°, pitch: {baselinePitch.toFixed(1)}°</div>
                            <Form.Label className="small">Ожидается зрителей</Form.Label>
                            <Form.Control type="number" min={0} value={expectedCount} onChange={(e) => setExpectedCount(parseInt(e.target.value || 0))} />
                            {!calibrated && <div className="text-secondary small mt-2">Совет: калибруйте при хорошем освещении, когда все смотрят на экран.</div>}
                        </Card.Body>
                    </Card>
                </Col>
            </Row>

            <div className="text-secondary small">
                Конфиденциальность: видео с камеры обрабатывается локально в браузере и никуда не отправляется. Получите согласие пользователей перед использованием камеры.
            </div>
        </Stack>
    </Card.Body>
</Card>
</Col>
</Row>
</Container>
</div>
);
}
