import { AlertTriangle, BarChart3, Bell, Camera, LogOut, MessageSquareText, Plus, ReceiptText, Save, Search, ShieldCheck, StoreIcon, Trash2, Upload } from "lucide-react";
import type { ErrorInfo, FormEvent, MouseEvent, ReactNode } from "react";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, getRefreshToken, setAccessToken, setRefreshToken, setUnauthorizedHandler } from "../api/client";
import type { Camera as CameraType, CameraRois, DashboardSummary, Receipt, Register, RoiImage, RoiPoint, RoiPolygon, SpeechEvent, Store, TimelineItem, TimelineResponse, User, Violation } from "../types";

type Screen = "dashboard" | "violations" | "stores" | "roi" | "transcripts" | "receipts" | "workstation";
type RoiGroup = "cashierRoi" | "scanRoi" | "customerRoi";
type TranscriptRefs = {
  stores: Map<string, Store>;
  registers: Map<string, Register>;
  cameras: Map<string, CameraType>;
};

type ErrorBoundaryState = {
  error: string | null;
};

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <div className="content"><div className="status warning"><AlertTriangle size={16} /> Ошибка экрана: {this.state.error}</div></div>;
    }
    return this.props.children;
  }
}

const screens: Array<{ id: Screen; label: string; icon: typeof BarChart3 }> = [
  { id: "dashboard", label: "Дашборд", icon: BarChart3 },
  { id: "violations", label: "Проверка", icon: ShieldCheck },
  { id: "stores", label: "Магазины", icon: StoreIcon },
  { id: "roi", label: "ROI камер", icon: Camera },
  { id: "transcripts", label: "Транскрипты", icon: MessageSquareText },
  { id: "receipts", label: "Чеки", icon: ReceiptText },
  { id: "workstation", label: "Рабочее место", icon: Bell },
];

const roiConfig: Record<RoiGroup, { label: string; color: string }> = {
  cashierRoi: { label: "Кассир", color: "#2f7d68" },
  scanRoi: { label: "Сканер", color: "#b44f18" },
  customerRoi: { label: "Покупатель", color: "#356fd4" },
};

const emptyRois = (): Omit<CameraRois, "image"> => ({
  cashierRoi: [],
  scanRoi: [],
  customerRoi: [],
});

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Суперадмин",
  ADMIN: "Администратор",
  OPERATIONS_DIRECTOR: "Операционный директор",
  REGIONAL_MANAGER: "Региональный менеджер",
  STORE_MANAGER: "Менеджер магазина",
  QUALITY_CONTROL: "Контроль качества",
  HR: "HR",
  ANALYST: "Аналитик",
  OPERATOR: "Оператор",
  EMPLOYEE: "Сотрудник",
  VIEWER: "Наблюдатель",
  ANALYTICS_SERVICE: "Analytics service",
  INTEGRATION_SERVICE: "Integration service",
};

function useLoad<T>(loader: () => Promise<T>, fallback: T, deps: unknown[]) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loader()
      .then((next) => active && setData(next))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : "Ошибка загрузки"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, deps);

  return { data, loading, error };
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [authError, setAuthError] = useState<string | null>(null);

  const clearSession = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  };

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    if (!getRefreshToken()) return;
    api
      .me()
      .then(setUser)
      .catch(() => clearSession());
  }, []);

  async function handleLogin(email: string, password: string) {
    setAuthError(null);
    try {
      const auth = await api.login(email, password);
      setAccessToken(auth.accessToken);
      setRefreshToken(auth.refreshToken);
      setUser(auth.user);
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.body.message : "Не удалось войти");
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      clearSession();
    }
  }

  if (!user) return <LoginScreen error={authError} onLogin={handleLogin} />;

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">CC</div>
          <div>
            <strong>Cashier Copilot</strong>
            <span>AI-мониторинг касс</span>
          </div>
        </div>
        <nav className="navList">
          {screens.map((item) => {
            const Icon = item.icon;
            return (
              <button className={screen === item.id ? "active" : ""} key={item.id} onClick={() => setScreen(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p>{roleLabels[user.role] ?? user.role}</p>
            <h1>{screenTitle(screen)}</h1>
          </div>
          <div className="userBox">
            <span>{user.firstName} {user.lastName}</span>
            <button aria-label="Выйти" title="Выйти" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <ErrorBoundary key={screen}>
          {screen === "dashboard" && <Dashboard />}
          {screen === "violations" && <Violations />}
          {screen === "stores" && <Stores user={user} />}
          {screen === "roi" && <RoiMarkup />}
          {screen === "transcripts" && <Transcripts />}
          {screen === "receipts" && <Receipts />}
          {screen === "workstation" && <Workstation />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

function LoginScreen({ error, onLogin }: { error: string | null; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("admin@gradusy24.kz");
  const [password, setPassword] = useState("password");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    await onLogin(email, password);
    setLoading(false);
  }

  return (
    <main className="loginPage">
      <form className="loginPanel" onSubmit={submit}>
        <div className="brand large">
          <div className="brandMark">CC</div>
          <div>
            <strong>Cashier Copilot</strong>
            <span>Контроль кассовых операций</span>
          </div>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={loading}>{loading ? "Вход..." : "Войти"}</button>
      </form>
    </main>
  );
}

function Dashboard() {
  const { data, loading, error } = useLoad<DashboardSummary>(() => api.get("/dashboard/summary"), {}, []);
  const totalReceipts = data.totalReceipts ?? data.receiptsTotal ?? 0;
  const totalViolations = data.totalViolations ?? data.receiptsChecked ?? 0;
  const possibleRisk = data.totalPossibleFinancialRiskAmount ?? data.potentialRiskAmount ?? 0;
  const cameraOnline = data.cameraAvailability?.reduce((sum, item) => item.videoStatus === "ONLINE" || item.audioStatus === "ONLINE" ? sum + (item._count ?? 0) : sum, 0) ?? 0;
  const cards = [
    ["Чеков всего", totalReceipts],
    ["AI-событий всего", totalViolations],
    ["High-risk отклонения", data.highRiskViolations ?? 0],
    ["Риск, сумма", formatMoney(possibleRisk)],
    ["Камер онлайн", cameraOnline],
    ["Ошибки интеграции", data.integrationErrors ?? 0],
  ];

  return (
    <section className="content">
      <StatusLine loading={loading} error={error} />
      <div className="metricGrid">
        {cards.map(([label, value]) => (
          <article className="metricCard" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function Violations() {
  const { data, loading, error } = useLoad(() => api.list<Violation>("/violations?page=1&limit=25&status=NEW"), { data: [], pagination: { page: 1, limit: 25, total: 0 } }, []);
  return (
    <section className="content">
      <StatusLine loading={loading} error={error} />
      <DataTable
        headers={["Событие", "Статус", "Риск", "Создано"]}
        rows={data.data.map((item) => [
          item.violationType ?? item.eventType ?? item.id,
          humanViolationStatus(item.status),
          item.severity ?? "-",
          formatDate(item.createdAt),
        ])}
        empty="Новых событий для проверки нет"
      />
    </section>
  );
}

function Stores({ user }: { user: User }) {
  const [reloadKey, setReloadKey] = useState(0);
  const stores = useLoad(() => api.list<Store>("/stores?page=1&limit=25"), { data: [], pagination: { page: 1, limit: 25, total: 0 } }, [reloadKey]);
  const registers = useLoad(() => api.list<Register>("/registers?page=1&limit=25"), { data: [], pagination: { page: 1, limit: 25, total: 0 } }, [reloadKey]);
  const cameras = useLoad(() => api.list<CameraType>("/cameras?page=1&limit=25"), { data: [], pagination: { page: 1, limit: 25, total: 0 } }, [reloadKey]);
  const canSeeCredentials = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const reload = () => setReloadKey((value) => value + 1);

  return (
    <section className="content managementLayout">
      <div className="formGrid">
        <CreateStoreForm onCreated={reload} />
        <CreateRegisterForm stores={stores.data.data} onCreated={reload} />
        <CreateCameraForm stores={stores.data.data} registers={registers.data.data} onCreated={reload} />
      </div>

      <div className="split">
        <div>
        <StatusLine loading={stores.loading} error={stores.error} />
        <h2><StoreIcon size={18} /> Магазины</h2>
        <DataTable headers={["Название", "Код", "Город", "Статус"]} rows={stores.data.data.map((s) => [s.name, s.code ?? "-", s.city ?? "-", s.isActive === false ? "Отключен" : "Активен"])} empty="Магазины не найдены" />
        </div>
        <div>
        <StatusLine loading={registers.loading || cameras.loading} error={registers.error ?? cameras.error} />
        <h2><Camera size={18} /> Кассы и камеры</h2>
        <DataTable headers={["Касса", "Код", "Workstation", "Статус"]} rows={registers.data.data.map((r) => [r.name ?? r.code ?? r.id, r.code ?? "-", r.workstationId ?? "-", r.isActive === false ? "Отключена" : "Активна"])} empty="Кассы не найдены" />
        <DataTable
          headers={["Камера", "Код", "RTSP", "Статус"]}
          rows={cameras.data.data.map((c) => [c.name ?? c.id, c.code ?? "-", canSeeCredentials ? c.videoRtspUrl ?? "скрыто" : "скрыто", c.isActive === false ? "Отключена" : "Активна"])}
          empty="Камеры не найдены"
        />
        </div>
      </div>
    </section>
  );
}

function CreateStoreForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("Asia/Almaty");
  return (
    <CreateForm
      title="Создать магазин"
      onSubmit={async () => {
        const normalizedCode = code.trim() || slugify(name) || `store-${Date.now()}`;
        await api.post<Store>("/stores", compact({ name, code: normalizedCode, city, address: address || name, timezone, isActive: true, metadata: {} }));
        setName("");
        setCode("");
        setCity("");
        setAddress("");
        setTimezone("Asia/Almaty");
        onCreated();
      }}
    >
      <label>Название<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Код интеграции<input value={code} onChange={(event) => setCode(event.target.value)} placeholder={slugify(name) || "tolstogo-90"} /></label>
      <label>Город<input value={city} onChange={(event) => setCity(event.target.value)} /></label>
      <label>Адрес<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label>Timezone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
    </CreateForm>
  );
}

function CreateRegisterForm({ stores, onCreated }: { stores: Store[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [storeId, setStoreId] = useState("");
  const [registerNumber, setRegisterNumber] = useState("");
  const [workstationId, setWorkstationId] = useState("");
  return (
    <CreateForm
      title="Создать кассу"
      onSubmit={async () => {
        const normalizedCode = code.trim() || slugify(name) || `register-${Date.now()}`;
        await api.post<Register>("/registers", compact({ name, code: normalizedCode, storeId, registerNumber: toOptionalNumber(registerNumber), workstationId, isActive: true }));
        setName("");
        setCode("");
        setStoreId("");
        setRegisterNumber("");
        setWorkstationId("");
        onCreated();
      }}
    >
      <label>Название<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Код интеграции<input value={code} onChange={(event) => setCode(event.target.value)} placeholder={slugify(name) || "register-1"} /></label>
      <label>Номер кассы<input value={registerNumber} onChange={(event) => setRegisterNumber(event.target.value)} type="number" min="1" /></label>
      <label>Workstation ID<input value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} placeholder="workstation-1" /></label>
      <SelectStore stores={stores} value={storeId} onChange={setStoreId} required />
    </CreateForm>
  );
}

function CreateCameraForm({ stores, registers, onCreated }: { stores: Store[]; registers: Register[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [storeId, setStoreId] = useState("");
  const [registerId, setRegisterId] = useState("");
  const [videoRtspUrl, setVideoRtspUrl] = useState("");
  const [audioRtspUrl, setAudioRtspUrl] = useState("");
  return (
    <CreateForm
      title="Создать камеру"
      onSubmit={async () => {
        const normalizedCode = code.trim() || slugify(name) || `camera-${Date.now()}`;
        await api.post<CameraType>("/cameras", compact({ name, code: normalizedCode, storeId, registerId, locationType: "CHECKOUT", videoEnabled: Boolean(videoRtspUrl), videoRtspUrl, audioEnabled: Boolean(audioRtspUrl), audioRtspUrl, isActive: true }));
        setName("");
        setCode("");
        setStoreId("");
        setRegisterId("");
        setVideoRtspUrl("");
        setAudioRtspUrl("");
        onCreated();
      }}
    >
      <label>Название<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Код интеграции<input value={code} onChange={(event) => setCode(event.target.value)} placeholder={slugify(name) || "cam10"} /></label>
      <SelectStore stores={stores} value={storeId} onChange={setStoreId} required />
      <SelectRegister registers={registers} value={registerId} onChange={setRegisterId} />
      <label>Video RTSP<input value={videoRtspUrl} onChange={(event) => setVideoRtspUrl(event.target.value)} placeholder="rtsp://user:pass@host/video" /></label>
      <label>Audio RTSP<input value={audioRtspUrl} onChange={(event) => setAudioRtspUrl(event.target.value)} placeholder="rtsp://user:pass@host/audio" /></label>
    </CreateForm>
  );
}

function CreateForm({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await onSubmit();
      setMessage("Создано");
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Не удалось создать");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="createPanel" onSubmit={submit}>
      <h2><Plus size={18} /> {title}</h2>
      {children}
      {error && <div className="formError">{error}</div>}
      {message && <div className="formSuccess">{message}</div>}
      <button className="primary" disabled={saving}>{saving ? "Создание..." : "Создать"}</button>
    </form>
  );
}

function SelectStore({ stores, value, onChange, required = false }: { stores: Store[]; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label>
      Магазин
      <select required={required} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Выберите магазин</option>
        {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select>
    </label>
  );
}

function SelectRegister({ registers, value, onChange }: { registers: Register[]; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      Касса
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Без привязки</option>
        {registers.map((register) => <option key={register.id} value={register.id}>{register.name ?? register.code ?? register.id}</option>)}
      </select>
    </label>
  );
}

function Receipts() {
  const { data, loading, error } = useLoad(() => api.list<Receipt>("/receipts?page=1&limit=25"), { data: [], pagination: { page: 1, limit: 25, total: 0 } }, []);
  return (
    <section className="content">
      <StatusLine loading={loading} error={error} />
      <DataTable
        headers={["Номер", "Операция", "Сумма", "Создано"]}
        rows={data.data.map((item) => [item.receiptNumber ?? item.id, item.operationType ?? "-", formatMoney(item.totalAmount ?? item.total ?? 0), formatDate(item.createdAt)])}
        empty="Чеки не найдены"
      />
    </section>
  );
}

function RoiMarkup() {
  const cameras = useLoad(() => api.list<CameraType>("/cameras?page=1&limit=100"), { data: [], pagination: { page: 1, limit: 100, total: 0 } }, []);
  const stores = useLoad(() => api.list<Store>("/stores?page=1&limit=100"), { data: [], pagination: { page: 1, limit: 100, total: 0 } }, []);
  const registers = useLoad(() => api.list<Register>("/registers?page=1&limit=100"), { data: [], pagination: { page: 1, limit: 100, total: 0 } }, []);
  const [cameraId, setCameraId] = useState("");
  const [cameraSearch, setCameraSearch] = useState("");
  const [image, setImage] = useState<RoiImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rois, setRois] = useState(emptyRois);
  const [activeGroup, setActiveGroup] = useState<RoiGroup>("cashierRoi");
  const [draftPoints, setDraftPoints] = useState<RoiPoint[]>([]);
  const [label, setLabel] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imageBoxRef = useRef<HTMLDivElement | null>(null);
  const cameraOptions = cameras.data.data.filter(hasEntityId);
  const cameraRefs = useMemo(() => ({
    stores: new Map(stores.data.data.filter(hasEntityId).map((store) => [store.id, store])),
    registers: new Map(registers.data.data.filter(hasEntityId).map((register) => [register.id, register])),
  }), [stores.data.data, registers.data.data]);
  const filteredCameraOptions = useMemo(() => {
    const search = cameraSearch.trim().toLowerCase();
    if (!search) return cameraOptions;
    return cameraOptions.filter((camera) => cameraSearchText(camera, cameraRefs).includes(search));
  }, [cameraOptions, cameraRefs, cameraSearch]);

  useEffect(() => {
    if (!cameraId) return;
    setStatus("Загрузка разметки...");
    setError(null);
    setDraftPoints([]);

    Promise.all([
      api.blob(`/cameras/${cameraId}/roi-reference-image`),
      api.get<CameraRois>(`/cameras/${cameraId}/rois`).catch(() => null),
    ])
      .then(async ([blob, roiData]) => {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        const nextUrl = URL.createObjectURL(blob);
        setImageUrl(nextUrl);
        const roiImage = roiData?.image ?? roiData?.referenceImage;
        const fallbackImage = await imageMetadataFromUrl(nextUrl, roiImage?.id ?? cameraId);
        setImage(roiImage ?? fallbackImage);
        if (roiData) {
          setRois(normalizeRois(roiData));
        } else {
          setRois(emptyRois());
        }
        setStatus(null);
      })
      .catch((err: unknown) => {
        setImageUrl(null);
        setImage(null);
        setRois(emptyRois());
        setError(err instanceof Error ? err.message : "Не удалось загрузить reference image");
        setStatus(null);
      });
  }, [cameraId]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  async function uploadReferenceImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!cameraId || !file) return;

    const formData = new FormData();
    formData.set("file", file);
    const width = (form.elements.namedItem("width") as HTMLInputElement | null)?.value;
    const height = (form.elements.namedItem("height") as HTMLInputElement | null)?.value;
    const capturedAt = (form.elements.namedItem("capturedAt") as HTMLInputElement | null)?.value;
    if (width) formData.set("width", width);
    if (height) formData.set("height", height);
    if (capturedAt) formData.set("capturedAt", new Date(capturedAt).toISOString());
    setStatus("Загрузка изображения...");
    setError(null);
    try {
      const uploaded = await api.upload<RoiImage | { referenceImage?: RoiImage; image?: RoiImage }>(`/cameras/${cameraId}/roi-reference-image`, formData);
      setImage(extractRoiImage(uploaded) ?? await imageMetadataFromFile(file, cameraId));
      const url = URL.createObjectURL(file);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(url);
      setRois(emptyRois());
      setDraftPoints([]);
      form.reset();
      setStatus("Изображение загружено");
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Не удалось загрузить изображение");
      setStatus(null);
    }
  }

  function addPoint(event: MouseEvent<SVGSVGElement>) {
    if (!imageBoxRef.current) return;
    const rect = imageBoxRef.current.getBoundingClientRect();
    const point = clampPoint({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
    setDraftPoints((points) => [...points, point]);
  }

  function finishPolygon() {
    if (draftPoints.length < 3) {
      setError("Для полигона нужно минимум 3 точки");
      return;
    }
    const nextPolygon: RoiPolygon = {
      label: label.trim() || `${activeGroup}-${rois[activeGroup].length + 1}`,
      points: draftPoints.map(clampPoint),
      metadata: {},
    };
    setRois((current) => ({ ...current, [activeGroup]: [...current[activeGroup], nextPolygon] }));
    setDraftPoints([]);
    setLabel("");
    setError(null);
  }

  async function saveRois() {
    if (!cameraId || !image) {
      setError("Выберите камеру и reference image");
      return;
    }
    const validationError = validateRois(rois);
    if (validationError) {
      setError(validationError);
      return;
    }
    setStatus("Сохранение...");
    setError(null);
    try {
      await api.patch<CameraRois>(`/cameras/${cameraId}/rois`, { image, ...rois });
      setStatus("ROI сохранены");
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : "Не удалось сохранить ROI");
      setStatus(null);
    }
  }

  function removePolygon(group: RoiGroup, index: number) {
    setRois((current) => ({
      ...current,
      [group]: current[group].filter((_, polygonIndex) => polygonIndex !== index),
    }));
  }

  return (
    <section className="content roiLayout">
      <div className="roiToolbar">
        <StatusLine loading={cameras.loading || stores.loading || registers.loading} error={cameras.error ?? stores.error ?? registers.error} />
        <div className="cameraPicker">
          <label>
            Поиск камеры
            <input value={cameraSearch} onChange={(event) => setCameraSearch(event.target.value)} placeholder="Название, магазин, касса или id" />
          </label>
          <label>
            Camera ID
            <input value={cameraId} onChange={(event) => setCameraId(event.target.value.trim())} placeholder="camera_id" />
          </label>
        </div>
        <CameraSelection cameras={filteredCameraOptions} refs={cameraRefs} selectedCameraId={cameraId} onSelect={setCameraId} />
        {!cameras.loading && !cameras.error && cameraOptions.length === 0 && <div className="status warning"><AlertTriangle size={16} /> Камеры не найдены. Создайте камеру в разделе магазинов или введите Camera ID вручную.</div>}
        {!cameras.loading && cameraOptions.length > 0 && filteredCameraOptions.length === 0 && <div className="empty">По этому поиску камер нет</div>}
        <form className="uploadForm" onSubmit={uploadReferenceImage}>
          <label>Reference image<input name="file" type="file" accept="image/jpeg,image/png,image/webp" /></label>
          <label>Width<input name="width" type="number" min="1" /></label>
          <label>Height<input name="height" type="number" min="1" /></label>
          <label>Captured at<input name="capturedAt" type="datetime-local" /></label>
          <button className="primary" disabled={!cameraId}><Upload size={16} /> Загрузить</button>
        </form>
      </div>

      <div className="roiEditor">
        <div className="roiCanvasPanel">
          {imageUrl ? (
            <div className="roiImageBox" ref={imageBoxRef}>
              <img src={imageUrl} alt="ROI reference" />
              <svg className="roiOverlay" viewBox="0 0 1 1" preserveAspectRatio="none" onClick={addPoint}>
                {(["cashierRoi", "scanRoi", "customerRoi"] as RoiGroup[]).flatMap((group) =>
                  ensureRoiArray(rois[group]).map((polygon, index) => (
                    <polygon key={`${group}-${index}`} points={toSvgPoints(polygon.points)} fill={roiConfig[group].color} fillOpacity="0.2" stroke={roiConfig[group].color} strokeWidth="0.006" />
                  )),
                )}
                {draftPoints.length > 0 && (
                  <polyline points={toSvgPoints(draftPoints)} fill="none" stroke={roiConfig[activeGroup].color} strokeWidth="0.008" />
                )}
                {draftPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="0.012" fill={roiConfig[activeGroup].color} />)}
              </svg>
            </div>
          ) : (
            <div className="empty roiEmpty">Выберите камеру с reference image или загрузите изображение вручную</div>
          )}
        </div>

        <aside className="roiSidePanel">
          <div className="segmented">
            {(["cashierRoi", "scanRoi", "customerRoi"] as RoiGroup[]).map((group) => (
              <button key={group} className={activeGroup === group ? "active" : ""} style={{ borderColor: roiConfig[group].color }} onClick={() => setActiveGroup(group)}>
                {roiConfig[group].label}
              </button>
            ))}
          </div>
          <label>Label<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={`${activeGroup}-main`} /></label>
          <div className="roiActions">
            <button onClick={finishPolygon} disabled={draftPoints.length < 3}>Завершить polygon</button>
            <button onClick={() => setDraftPoints([])} disabled={!draftPoints.length}>Очистить точки</button>
            <button className="primary" onClick={saveRois} disabled={!imageUrl || !cameraId}><Save size={16} /> Сохранить</button>
          </div>
          {status && <div className="formSuccess">{status}</div>}
          {error && <div className="formError">{error}</div>}
          <RoiList rois={rois} onRemove={removePolygon} />
        </aside>
      </div>
    </section>
  );
}

function CameraSelection({ cameras, refs, selectedCameraId, onSelect }: { cameras: CameraType[]; refs: { stores: Map<string, Store>; registers: Map<string, Register> }; selectedCameraId: string; onSelect: (cameraId: string) => void }) {
  if (!cameras.length) return null;
  return (
    <div className="cameraChoiceGrid">
      {cameras.map((camera) => {
        const register = camera.registerId ? refs.registers.get(camera.registerId) : undefined;
        const storeId = camera.storeId ?? register?.storeId;
        const store = storeId ? refs.stores.get(storeId) : undefined;
        return (
          <button className={selectedCameraId === camera.id ? "active" : ""} key={camera.id} onClick={() => onSelect(camera.id)}>
            <strong>{formatCameraName(camera)}</strong>
            <span>{store ? formatStoreName(store) : storeId ?? "магазин не указан"}</span>
            <span>{register ? formatRegisterName(register) : camera.registerId ?? "касса не указана"}</span>
            <small>{camera.id}</small>
          </button>
        );
      })}
    </div>
  );
}

function RoiList({ rois, onRemove }: { rois: Omit<CameraRois, "image">; onRemove: (group: RoiGroup, index: number) => void }) {
  return (
    <div className="roiList">
      {(["cashierRoi", "scanRoi", "customerRoi"] as RoiGroup[]).map((group) => (
        <div key={group}>
          <h3 style={{ color: roiConfig[group].color }}>{roiConfig[group].label}</h3>
          {ensureRoiArray(rois[group]).length === 0 && <p className="hint">Нет полигонов</p>}
          {ensureRoiArray(rois[group]).map((polygon, index) => (
            <div className="roiListItem" key={`${group}-${index}`}>
              <span>{polygon.label} · {polygon.points.length} точек</span>
              <button aria-label="Удалить polygon" title="Удалить polygon" onClick={() => onRemove(group, index)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Transcripts() {
  const stores = useLoad(() => api.list<Store>("/stores?page=1&limit=100"), { data: [], pagination: { page: 1, limit: 100, total: 0 } }, []);
  const registers = useLoad(() => api.list<Register>("/registers?page=1&limit=100"), { data: [], pagination: { page: 1, limit: 100, total: 0 } }, []);
  const cameras = useLoad(() => api.list<CameraType>("/cameras?page=1&limit=100"), { data: [], pagination: { page: 1, limit: 100, total: 0 } }, []);
  const [registerId, setRegisterId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ registerId: "", sessionId: "" });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [timelineSessionId, setTimelineSessionId] = useState("");
  const [timelineItems, setTimelineItems] = useState<Array<TimelineItem<SpeechEvent>>>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineLoadedFor, setTimelineLoadedFor] = useState("");
  const query = useMemo(() => buildSpeechEventsPath(appliedFilters.registerId, appliedFilters.sessionId, page, limit), [appliedFilters, page, limit]);
  const { data, loading, error } = useLoad(() => api.list<SpeechEvent>(query), { data: [], pagination: { page: 1, limit: 50, total: 0 } }, [query]);
  const refs = useMemo<TranscriptRefs>(() => ({
    stores: new Map(stores.data.data.map((store) => [store.id, store])),
    registers: new Map(registers.data.data.map((register) => [register.id, register])),
    cameras: new Map(cameras.data.data.map((camera) => [camera.id, camera])),
  }), [stores.data.data, registers.data.data, cameras.data.data]);
  const refsLoading = stores.loading || registers.loading || cameras.loading;
  const refsError = stores.error ?? registers.error ?? cameras.error;

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ registerId, sessionId });
  }

  async function loadTimeline(event: FormEvent) {
    event.preventDefault();
    if (!timelineSessionId.trim()) return;
    setTimelineLoading(true);
    setTimelineError(null);
    setTimelineItems([]);
    try {
      const timeline = await api.get<TimelineResponse<SpeechEvent> | Array<TimelineItem<SpeechEvent>>>(`/checkout-sessions/${encodeURIComponent(timelineSessionId.trim())}/timeline`);
      setTimelineItems(normalizeTimeline(timeline).filter((item): item is TimelineItem<SpeechEvent> => item.type === "speech"));
      setTimelineLoadedFor(timelineSessionId.trim());
    } catch (err) {
      setTimelineError(err instanceof ApiError ? err.body.message : "Не удалось загрузить timeline");
    } finally {
      setTimelineLoading(false);
    }
  }

  return (
    <section className="content transcriptLayout">
      <div className="transcriptPanel">
        <form className="filterBar" onSubmit={applyFilters}>
          <label>Register ID<input value={registerId} onChange={(event) => setRegisterId(event.target.value)} placeholder="REGISTER_ID" /></label>
          <label>Session ID<input value={sessionId} onChange={(event) => setSessionId(event.target.value)} placeholder="SESSION_ID" /></label>
          <label>
            На странице
            <select value={limit} onChange={(event) => { setPage(1); setLimit(Number(event.target.value)); }}>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button className="primary"><Search size={16} /> Найти</button>
        </form>
        <StatusLine loading={refsLoading} error={refsError} />
        <StatusLine loading={loading} error={error} />
        <PaginationControls pagination={data.pagination} loading={loading} onPageChange={setPage} />
        <TranscriptList events={data.data} refs={refs} empty="Транскрипты не найдены" />
        <PaginationControls pagination={data.pagination} loading={loading} onPageChange={setPage} />
      </div>

      <aside className="transcriptPanel">
        <form className="timelineSearch" onSubmit={loadTimeline}>
          <label>Checkout session timeline<input value={timelineSessionId} onChange={(event) => setTimelineSessionId(event.target.value)} placeholder="checkout-session-id" /></label>
          <button className="primary"><Search size={16} /> Timeline</button>
        </form>
        <StatusLine loading={timelineLoading} error={timelineError} />
        {timelineLoadedFor && <p className="hint">Speech events из session `{timelineLoadedFor}`</p>}
        <TranscriptList events={timelineItems.map((item) => item.data)} refs={refs} empty="В timeline нет speech events" />
      </aside>
    </section>
  );
}

function PaginationControls({ pagination, loading, onPageChange }: { pagination: { page: number; limit: number; total: number }; loading: boolean; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.total, pagination.page * pagination.limit);

  return (
    <div className="paginationBar">
      <span>{from}-{to} из {pagination.total}</span>
      <div>
        <button disabled={loading || pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Назад</button>
        <strong>{pagination.page} / {totalPages}</strong>
        <button disabled={loading || pagination.page >= totalPages} onClick={() => onPageChange(pagination.page + 1)}>Вперед</button>
      </div>
    </div>
  );
}

function TranscriptList({ events, refs, empty }: { events: SpeechEvent[]; refs: TranscriptRefs; empty: string }) {
  if (!events.length) return <div className="empty">{empty}</div>;
  return (
    <div className="transcriptList">
      {events.map((event) => {
        const labels = transcriptLabels(event, refs);
        return (
          <article className="transcriptItem" key={event.id}>
            <div className="transcriptMeta">
              <strong>{speakerLabel(event.speakerType)}</strong>
              <span>{formatDate(event.startedAt)}{event.endedAt ? ` - ${formatTime(event.endedAt)}` : ""}</span>
              <span>{event.language ?? "lang: -"}</span>
              <span>{formatConfidence(event.confidence)}</span>
            </div>
            <p>{event.text}</p>
            <div className="transcriptIds">
              {labels.store && <span>магазин: {labels.store}</span>}
              {labels.register && <span>касса: {labels.register}</span>}
              {labels.camera && <span>камера: {labels.camera}</span>}
              {event.sessionId && <span>session: {event.sessionId}</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Workstation() {
  const [workstationId, setWorkstationId] = useState("workstation-1");
  const wsUrl = useMemo(() => `ws://localhost:3000/api/v1/workstations/${encodeURIComponent(workstationId)}/notifications`, [workstationId]);

  return (
    <section className="content">
      <div className="workstationControls">
        <label>
          Workstation ID
          <input value={workstationId} onChange={(event) => setWorkstationId(event.target.value)} />
        </label>
        <span>{wsUrl}</span>
      </div>
      <p className="hint">Уведомления кассира отображаются как неблокирующие события. Подтверждение, отклонение и исправление отправляются через employee-notifications API.</p>
    </section>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: Array<Array<string | number>>; empty: string }) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table>
      <thead>
        <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusLine({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div className="status">Загрузка...</div>;
  if (error) return <div className="status warning"><AlertTriangle size={16} /> {error}</div>;
  return null;
}

function screenTitle(screen: Screen) {
  return {
    dashboard: "Операционная сводка",
    violations: "Очередь проверки AI-событий",
    stores: "Магазины, кассы и камеры",
    roi: "ROI разметка камеры",
    transcripts: "Транскрипты speech events",
    receipts: "Чеки и операции",
    workstation: "Уведомления рабочего места",
  }[screen];
}

function humanViolationStatus(status: string) {
  if (status === "NEW" || status === "IN_PROGRESS") return "Требует проверки";
  if (status === "CONFIRMED") return "Подтверждено";
  if (status === "FALSE_POSITIVE") return "Ложное срабатывание";
  return status.replaceAll("_", " ").toLowerCase();
}

function compact<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "" && value !== undefined && value !== null));
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hasEntityId<T extends { id?: unknown }>(value: T | null | undefined): value is T & { id: string } {
  return typeof value?.id === "string" && value.id.length > 0;
}

function clampPoint(point: RoiPoint): RoiPoint {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

function toSvgPoints(points: RoiPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function normalizeRois(value: Partial<CameraRois> | null | undefined): Omit<CameraRois, "image"> {
  return {
    cashierRoi: normalizeRoiGroup(value?.cashierRoi),
    scanRoi: normalizeRoiGroup(value?.scanRoi),
    customerRoi: normalizeRoiGroup(value?.customerRoi),
  };
}

function imageMetadataFromUrl(url: string, id: string): Promise<RoiImage> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ id, width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ id, width: 1, height: 1 });
    img.src = url;
  });
}

function imageMetadataFromFile(file: File, id: string): Promise<RoiImage> {
  const url = URL.createObjectURL(file);
  return imageMetadataFromUrl(url, id).finally(() => URL.revokeObjectURL(url));
}

function extractRoiImage(value: RoiImage | { referenceImage?: RoiImage; image?: RoiImage } | null | undefined): RoiImage | null {
  if (!value || typeof value !== "object") return null;
  const maybeImage = value as Partial<RoiImage>;
  if (typeof maybeImage.id === "string" && typeof maybeImage.width === "number" && typeof maybeImage.height === "number") {
    return maybeImage as RoiImage;
  }
  return "referenceImage" in value ? value.referenceImage ?? value.image ?? null : null;
}

function normalizeRoiGroup(value: unknown): RoiPolygon[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((polygon, index) => normalizeRoiPolygon(polygon, index))
    .filter((polygon): polygon is RoiPolygon => polygon !== null);
}

function ensureRoiArray(value: unknown): RoiPolygon[] {
  return Array.isArray(value) ? value : [];
}

function normalizeRoiPolygon(value: unknown, index: number): RoiPolygon | null {
  if (!value || typeof value !== "object") return null;
  const polygon = value as Record<string, unknown>;
  const points = Array.isArray(polygon.points) ? polygon.points.map(normalizeRoiPoint).filter((point): point is RoiPoint => point !== null) : [];
  if (points.length === 0) return null;
  return {
    label: typeof polygon.label === "string" && polygon.label ? polygon.label : `polygon-${index + 1}`,
    points,
    metadata: polygon.metadata && typeof polygon.metadata === "object" && !Array.isArray(polygon.metadata) ? polygon.metadata as Record<string, unknown> : {},
  };
}

function normalizeRoiPoint(value: unknown): RoiPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  if (typeof point.x !== "number" || typeof point.y !== "number") return null;
  return clampPoint({ x: point.x, y: point.y });
}

function validateRois(rois: Omit<CameraRois, "image">) {
  for (const group of ["cashierRoi", "scanRoi", "customerRoi"] as RoiGroup[]) {
    for (const polygon of ensureRoiArray(rois[group])) {
      if (polygon.points.length < 3) return `${roiConfig[group].label}: минимум 3 точки на polygon`;
      if (polygon.points.some((point) => point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
        return `${roiConfig[group].label}: координаты должны быть в диапазоне 0..1`;
      }
    }
  }
  return null;
}

function buildSpeechEventsPath(registerId: string, sessionId: string, page = 1, limit = 50) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy: "startedAt",
    sortOrder: "asc",
  });
  if (registerId.trim()) params.set("registerId", registerId.trim());
  if (sessionId.trim()) params.set("sessionId", sessionId.trim());
  return `/speech-events?${params.toString()}`;
}

function normalizeTimeline<T>(value: TimelineResponse<T> | Array<TimelineItem<T>>): Array<TimelineItem<T>> {
  return Array.isArray(value) ? value : value.data;
}

function speakerLabel(value: SpeechEvent["speakerType"]) {
  if (value === "CASHIER") return "Кассир";
  if (value === "CUSTOMER") return "Покупатель";
  if (value === "SYSTEM") return "Система";
  return "Не определен";
}

function formatConfidence(value: number | undefined) {
  if (value === undefined) return "confidence: -";
  return `confidence: ${Math.round(value * 100)}%`;
}

function transcriptLabels(event: SpeechEvent, refs: TranscriptRefs) {
  const register = event.registerId ? refs.registers.get(event.registerId) : undefined;
  const camera = event.cameraId ? refs.cameras.get(event.cameraId) : undefined;
  const storeId = event.storeId ?? register?.storeId ?? camera?.storeId;
  const store = storeId ? refs.stores.get(storeId) : undefined;

  return {
    store: store ? formatStoreName(store) : storeId,
    register: register ? formatRegisterName(register) : event.registerId,
    camera: camera ? formatCameraName(camera) : event.cameraId,
  };
}

function cameraSearchText(camera: CameraType, refs: { stores: Map<string, Store>; registers: Map<string, Register> }) {
  const register = camera.registerId ? refs.registers.get(camera.registerId) : undefined;
  const storeId = camera.storeId ?? register?.storeId;
  const store = storeId ? refs.stores.get(storeId) : undefined;
  return [
    camera.id,
    camera.name,
    camera.storeId,
    camera.registerId,
    store?.name,
    store?.city,
    register?.name,
    register?.code,
  ].filter(Boolean).join(" ").toLowerCase();
}

function formatStoreName(store: Store) {
  return [store.name, store.city].filter(Boolean).join(", ");
}

function formatRegisterName(register: Register) {
  return register.name ?? register.code ?? register.id;
}

function formatCameraName(camera: CameraType) {
  return camera.name ?? camera.id;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeStyle: "medium" }).format(new Date(value));
}

function formatMoney(value: number | string) {
  const numericValue = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(Number.isFinite(numericValue) ? numericValue : 0);
}
