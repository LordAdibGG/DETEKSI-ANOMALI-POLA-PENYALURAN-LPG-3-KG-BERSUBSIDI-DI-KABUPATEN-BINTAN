import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Reveal } from '../components/motion/Primitives';
import { AturanGaris } from '../components/ui/AturanGaris';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@bintankab.go.id');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);

    if (!res.ok) {
      setErrorMessage(res.message || 'Gagal memverifikasi kredensial.');
      return;
    }

    pushToast({
      judul: 'Sesi pengawasan dibuka',
      deskripsi: `Terautentikasi sebagai ${email}`,
      nada: 'berhasil',
    });
    navigate('/ringkasan');
  };

  const handleQuickFill = (role: 'admin' | 'petugas') => {
    if (role === 'admin') {
      setEmail('admin@bintankab.go.id');
      setPassword('admin123');
    } else {
      setEmail('petugas@bintankab.go.id');
      setPassword('petugas123');
    }
    setErrorMessage(null);
  };

  return (
    <div
      data-testid="typographic-login-page"
      className="min-h-screen flex flex-col justify-between bg-[var(--surface-paper)] text-[var(--text-ink)] px-6 py-6 md:px-12 md:py-8"
    >
      {/* Baris Atas Lembar Pengesahan */}
      <header className="max-w-[1360px] w-full mx-auto border-b-2 border-[var(--border-strong)] pb-4 flex flex-wrap items-center justify-between gap-4 font-tabular text-xs">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 bg-[#86B817] border border-[var(--border-strong)]"
          />
          <span className="uppercase tracking-[0.14em] font-semibold">
            Setda Kabupaten Bintan · Bagian Perekonomian
          </span>
        </div>

        <div className="flex items-center gap-4 text-[var(--text-muted)]">
          <button
            type="button"
            onClick={toggleTheme}
            className="uppercase tracking-wider font-semibold text-[var(--text-ink)] hover:text-[var(--accent-anomali-teks)] cursor-pointer"
          >
            Mode: {theme === 'terang' ? 'Kertas' : 'Gelap'}
          </button>
          <span>·</span>
          <Link to="/ringkasan" className="underline underline-offset-4 hover:text-[var(--text-ink)]">
            Ke Buku Besar
          </Link>
          <span>·</span>
          <Link to="/__kit" className="underline underline-offset-4 hover:text-[var(--text-ink)]">
            /__kit
          </Link>
        </div>
      </header>

      {/* Isi Utama: Komposisi Editorial Dua Kolom Asimetris */}
      <main className="max-w-[1360px] w-full mx-auto my-auto py-8">
        <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Kolom Kiri (7/12): Pernyataan Editorial & Kolofon Riset */}
            <div className="lg:col-span-7 lg:pr-8 lg:border-r border-[var(--border-rule)]">
              <div className="font-tabular text-xs uppercase tracking-[0.18em] text-[var(--text-muted)] mb-3">
                Buku Besar Pengawasan Penyaluran LPG 3 kg · Tahun Data 2026
              </div>

              <h1 className="font-editorial text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.06] tracking-tight text-[var(--text-ink)]">
                Lembar Pantau
              </h1>

              <p className="font-editorial italic text-xl sm:text-2xl text-[var(--text-muted)] mt-3 leading-snug">
                Prioritisasi pemeriksaan lapangan berbasis deteksi anomali kepadatan lokal (Local
                Outlier Factor).
              </p>

              <AturanGaris varian="ganda" className="my-6" />

              <div className="space-y-4 text-sm leading-relaxed text-[var(--text-ink)] max-w-2xl">
                <p>
                  Sistem ini membantu <strong>Bagian Perekonomian Setda Kabupaten Bintan</strong>{' '}
                  dan <strong>Tim Monitoring dan Evaluasi (Monev)</strong> menyaring pola penyaluran
                  harian pada 30 pangkalan LPG 3 kg bersubsidi selama periode Januari hingga Oktober
                  2026.
                </p>
                <p className="border-l-2 border-[#D9480F] pl-4 py-1 text-[var(--text-muted)]">
                  <strong className="text-[var(--text-ink)]">Prinsip kehati-hatian:</strong> Skor
                  LOF bukan probabilitas dan hasil penandaan merupakan{' '}
                  <strong className="text-[var(--text-ink)] underline underline-offset-4">
                    indikasi awal
                  </strong>{' '}
                  untuk memprioritaskan kunjungan verifikasi lapangan, bukan bukti pelanggaran.
                </p>
              </div>

              {/* Tabel Kolofon Parameter Riset */}
              <dl className="mt-8 pt-5 border-t border-[var(--border-rule)] grid grid-cols-2 sm:grid-cols-4 gap-4 font-tabular text-xs">
                <div>
                  <dt className="text-[var(--text-muted)] uppercase tracking-wider">Cakupan</dt>
                  <dd className="text-base font-semibold text-[var(--text-ink)] mt-0.5">
                    30 Pangkalan
                  </dd>
                  <dd className="text-[11px] text-[var(--text-soft)]">Kode P01 – P30</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)] uppercase tracking-wider">Observasi</dt>
                  <dd className="text-base font-semibold text-[var(--text-ink)] mt-0.5">
                    293 Bulan
                  </dd>
                  <dd className="text-[11px] text-[var(--text-soft)]">282 masuk model</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)] uppercase tracking-wider">Parameter</dt>
                  <dd className="text-base font-semibold text-[var(--text-ink)] mt-0.5">
                    LOF k = 10
                  </dd>
                  <dd className="text-[11px] text-[var(--text-soft)]">Ambang ≥ 1,50</dd>
                </div>
                <div>
                  <dt className="text-[var(--text-muted)] uppercase tracking-wider">Indikasi</dt>
                  <dd className="text-base font-semibold text-[var(--accent-anomali-teks)] mt-0.5">
                    28 Ditandai
                  </dd>
                  <dd className="text-[11px] text-[var(--text-soft)]">Jan – Okt 2026</dd>
                </div>
              </dl>
            </div>

            {/* Kolom Kanan (5/12): Formulir Otentikasi Tipografis */}
            <div className="lg:col-span-5">
              <div className="border-t-2 border-b border-[var(--border-strong)] py-6">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="font-editorial text-2xl font-bold text-[var(--text-ink)]">
                    Pengesahan Akses
                  </h2>
                  <span className="font-tabular text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                    Sanctum Bearer
                  </span>
                </div>

                <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-6">
                  Peran <strong>Petugas</strong> hanya melihat kode pangkalan (
                  <span className="font-tabular">P01–P30</span>). Peran <strong>Admin</strong>{' '}
                  memiliki wewenang melihat identitas pangkalan asli dan menjalankan ulang model.
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="login-email"
                      className="block font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5"
                    >
                      Alamat Surel Kedinasan
                    </label>
                    <input
                      id="login-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-[var(--border-strong)] bg-transparent font-tabular text-sm text-[var(--text-ink)] focus:border-[#D9480F]"
                      placeholder="nama@bintankab.go.id"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="login-password"
                      className="block font-tabular text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1.5"
                    >
                      Kata Sandi
                    </label>
                    <input
                      id="login-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 py-2.5 border border-[var(--border-strong)] bg-transparent font-tabular text-sm text-[var(--text-ink)] focus:border-[#D9480F]"
                      placeholder="••••••••"
                    />
                  </div>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="border-l-2 border-[#D9480F] pl-3 py-1 text-xs font-tabular text-[var(--accent-anomali-teks)]"
                    >
                      {errorMessage}
                    </div>
                  )}

                  <div className="pt-1 flex flex-wrap items-center gap-3">
                    <Button type="submit" variant="utama" size="lg" loading={loading} className="w-full">
                      Buka Buku Besar Pengawasan
                    </Button>
                  </div>
                </form>

                <AturanGaris label="Isi Cepat Akun Uji" className="my-5" />

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="sekunder"
                    size="sm"
                    onClick={() => handleQuickFill('admin')}
                  >
                    Isi Akun Admin
                  </Button>
                  <Button
                    type="button"
                    variant="sekunder"
                    size="sm"
                    onClick={() => handleQuickFill('petugas')}
                  >
                    Isi Akun Petugas
                  </Button>
                </div>

                <div className="mt-4 text-[11px] font-tabular text-[var(--text-soft)]">
                  Atau langsung masuk pratinjau sebagai:{' '}
                  <button
                    type="button"
                    onClick={() => {
                      loginDemo('admin');
                      navigate('/ringkasan');
                    }}
                    className="underline text-[var(--text-ink)] cursor-pointer mr-2"
                  >
                    Admin
                  </button>
                  ·
                  <button
                    type="button"
                    onClick={() => {
                      loginDemo('petugas');
                      navigate('/ringkasan');
                    }}
                    className="underline text-[var(--text-ink)] cursor-pointer ml-2"
                  >
                    Petugas
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </main>

      {/* Catatan Kaki Lembar Masuk */}
      <footer className="max-w-[1360px] w-full mx-auto border-t border-[var(--border-rule)] pt-4 flex flex-col sm:flex-row justify-between gap-2 font-tabular text-xs text-[var(--text-muted)]">
        <span>Proyek Penambangan Data · Program Studi Teknik Informatika UMRAH</span>
        <span>Sumber Data: Rekapitulasi KJP 2026 (Januari–Oktober)</span>
      </footer>
    </div>
  );
}
