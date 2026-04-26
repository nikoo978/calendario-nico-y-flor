import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Heart, Briefcase, GraduationCap, Info, Smartphone, StickyNote, Cloud, Loader2, AlertTriangle, CloudOff } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot } from 'firebase/firestore';

// --- CONFIGURACIÓN DE FIREBASE ---
const miConfiguracionLocal = {
  apiKey: "AIzaSyCL297fjTrG--EFpfRuDcUWUlnWMOpUnOI",
  authDomain: "calendario-nico-y-flor.firebaseapp.com",
  projectId: "calendario-nico-y-flor",
  storageBucket: "calendario-nico-y-flor.firebasestorage.app",
  messagingSenderId: "736690756627",
  appId: "1:736690756627:web:369c09e25959083d2ef3e6",
  measurementId: "G-3Q43N5HYZ3"
};

let firebaseConfig;
try {
  firebaseConfig = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : miConfiguracionLocal;
} catch (e) {
  firebaseConfig = miConfiguracionLocal;
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'calendario-nico-flor';

const FERIADOS_2026 = {
  "2026-01-01": "Año Nuevo",
  "2026-02-16": "Carnaval",
  "2026-02-17": "Carnaval",
  "2026-03-23": "Feriado Puente",
  "2026-03-24": "Día de la Memoria",
  "2026-04-02": "Malvinas",
  "2026-04-03": "Viernes Santo",
  "2026-05-01": "Día del Trabajador",
  "2026-05-25": "Revolución de Mayo",
  "2026-06-15": "Gral. Güemes",
  "2026-06-20": "Gral. Belgrano",
  "2026-07-09": "Independencia",
  "2026-07-10": "Feriado Puente",
  "2026-08-17": "Gral. San Martín",
  "2026-10-12": "Diversidad Cultural",
  "2026-11-23": "Soberanía Nacional",
  "2026-12-07": "Feriado Puente",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad"
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DIAS_SEMANA = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

export default function App() {
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Autenticación inicial
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Error de auth:", err);
        setLoading(false);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u && !loading) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Escuchar cambios en la nube
  useEffect(() => {
    if (!user) return;

    const notesDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar_notes', 'notes_doc');
    
    const unsubscribe = onSnapshot(notesDocRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const sanitizedData = {};
          Object.keys(data).forEach(key => {
            sanitizedData[key] = String(data[key]);
          });
          setNotes(sanitizedData);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error leyendo:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Guardado optimista: Actualiza la pantalla y luego la nube
  const handleNoteChange = (monthIndex, value) => {
    // 1. Actualizamos el estado local inmediatamente para que se vea lo que escribís
    const newNotes = { ...notes, [monthIndex]: value };
    setNotes(newNotes);
    
    // 2. Disparamos el guardado en la nube
    saveToCloud(newNotes);
  };

  const saveToCloud = async (updatedNotes) => {
    if (!user) return;
    setSyncing(true);
    try {
      const notesDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'calendar_notes', 'notes_doc');
      await setDoc(notesDocRef, updatedNotes);
    } catch (err) {
      console.error("Error guardando en nube:", err);
    } finally {
      setSyncing(false);
    }
  };

  const fechaReferenciaTrabajo = new Date(2026, 3, 24);

  const obtenerEstadoDia = (fecha) => {
    const fechaISO = fecha.toISOString().split('T')[0];
    const diffTime = fecha.getTime() - fechaReferenciaTrabajo.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));
    const esTrabajo = ((diffDays % 4) + 4) % 4 === 0;
    const diaDeLaSemana = fecha.getDay();
    const esCursada = diaDeLaSemana >= 2 && diaDeLaSemana <= 4;

    return {
      esTrabajo,
      esCursada,
      esCoincidencia: esTrabajo && esCursada,
      feriado: FERIADOS_2026[fechaISO] || null
    };
  };

  const datosCalendario = useMemo(() => {
    const mesesVisuales = [];
    let contadorCoincidencias = 0;

    for (let m = 0; m < 12; m++) {
      const primerDiaMes = new Date(2026, m, 1);
      const ultimoDiaMes = new Date(2026, m + 1, 0);
      const diasEnMes = ultimoDiaMes.getDate();
      let diaInicio = primerDiaMes.getDay() - 1;
      if (diaInicio === -1) diaInicio = 6;

      const semanas = [];
      let semanaActual = Array(7).fill(null);
      let punteroDia = diaInicio;

      for (let d = 1; d <= diasEnMes; d++) {
        const fechaActual = new Date(2026, m, d);
        const estado = obtenerEstadoDia(fechaActual);
        if (estado.esCoincidencia) contadorCoincidencias++;
        semanaActual[punteroDia] = { numero: d, ...estado };
        punteroDia++;
        if (punteroDia === 7 || d === diasEnMes) {
          semanas.push(semanaActual);
          semanaActual = Array(7).fill(null);
          punteroDia = 0;
        }
      }
      mesesVisuales.push({ nombre: MESES[m], semanas });
    }
    return { meses: mesesVisuales, totalCoincidencias: contadorCoincidencias };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
        <Loader2 className="w-12 h-12 text-red-500 animate-spin mb-4" />
        <p className="font-bold text-slate-500 animate-pulse uppercase tracking-widest text-xs">
          Cargando Calendario de Nico y Flor...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-12">
      <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="bg-red-500 p-2 rounded-xl shadow-md">
              <Heart className="text-white fill-white" size={18} />
            </div>
            <h1 className="font-extrabold text-xl tracking-tight italic">Nico y Flor 2026</h1>
          </div>
          <div className="flex items-center gap-4">
            {syncing ? (
               <div className="flex items-center gap-1 text-[10px] font-bold text-blue-500 uppercase">
                 <Loader2 size={12} className="animate-spin" /> Guardando...
               </div>
            ) : (
              <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase">
                <Cloud size={14} /> Sincronizado
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <header className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 mb-10 text-white relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-black mb-4 tracking-tight uppercase italic text-white leading-tight">
              Calendario <br className="md:hidden" /> Nico y Flor
            </h2>
            <p className="text-slate-400 text-lg max-w-xl mb-8 leading-tight">
              Nuestro espacio compartido para organizar el 2026 y disfrutar cada momento.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 flex flex-col items-center min-w-[120px]">
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Coincidencias</span>
                <span className="text-3xl font-black text-red-400 tracking-tighter">{datosCalendario.totalCoincidencias} días</span>
              </div>
              <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 flex flex-col items-center min-w-[120px]">
                <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Rotación</span>
                <span className="text-3xl font-black text-blue-400 font-mono italic tracking-tighter">4 x 4</span>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-[80px] -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-red-600/10 rounded-full blur-[80px] -ml-32 -mb-32"></div>
        </header>

        <div className="flex flex-wrap gap-3 mb-10 justify-center">
          <LegendItem color="bg-blue-500" label="Trabajo Nico" icon={<Briefcase size={12} />} />
          <LegendItem color="bg-amber-400" label="Cursada Flor" icon={<GraduationCap size={12} />} />
          <LegendItem color="bg-red-600 shadow-sm shadow-red-200" label="Día Ocupado" pulse icon={<Heart size={12} />} />
          <LegendItem color="bg-emerald-500" label="Feriado ARG" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {datosCalendario.meses.map((mes, idx) => (
            <div key={idx} className="flex flex-col gap-4">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-7 shadow-sm hover:shadow-md transition-all duration-300 h-full flex flex-col group">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter group-hover:text-red-500 transition-colors">
                    {mes.nombre}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-300 tracking-widest font-mono">2026</span>
                </div>
                
                <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-black text-slate-400 uppercase mb-4 tracking-tighter">
                  {DIAS_SEMANA.map(d => <div key={d}>{d}</div>)}
                </div>

                <div className="space-y-1.5 flex-grow">
                  {mes.semanas.map((semana, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-7 gap-1.5">
                      {semana.map((dia, dIdx) => (
                        <div key={dIdx} className="aspect-square relative group/day">
                          {dia ? (
                            <div className={`
                              w-full h-full flex flex-col items-center justify-center rounded-xl text-sm font-bold transition-all relative cursor-default
                              ${dia.esCoincidencia 
                                ? 'bg-red-600 text-white shadow-lg shadow-red-100 scale-110 z-10' 
                                : dia.esTrabajo 
                                  ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                  : dia.esCursada 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                    : dia.feriado
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                                      : 'text-slate-400 hover:bg-slate-50'
                              }
                            `}>
                              {dia.numero}
                              {dia.feriado && (
                                <div className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full border border-white shadow-sm ${dia.esCoincidencia ? 'bg-white' : 'bg-emerald-500'}`}></div>
                              )}

                              {(dia.feriado || dia.esCoincidencia) && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 pointer-events-none opacity-0 group-hover/day:opacity-100 transition-all duration-200 z-50">
                                  <div className="bg-slate-900 text-white text-[10px] p-2.5 rounded-xl shadow-2xl text-center leading-tight">
                                    {dia.feriado && <p className="text-emerald-400 font-bold mb-1 uppercase tracking-tighter">{String(dia.feriado)}</p>}
                                    {dia.esCoincidencia && <p className="font-medium tracking-tight text-white uppercase italic">¡Ocupados!</p>}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="mt-8 pt-5 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-slate-400">
                      <StickyNote size={14} className="group-hover:text-indigo-500 transition-colors" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Notas de {mes.nombre}</span>
                    </div>
                  </div>
                  <textarea
                    className="w-full bg-slate-50 border-2 border-transparent rounded-[1.5rem] p-4 text-xs text-slate-600 placeholder:text-slate-300 focus:bg-white focus:border-red-100 focus:ring-0 transition-all resize-none min-h-[90px] shadow-inner"
                    placeholder="Escribí una cita o recordatorio..."
                    value={notes[idx] ? String(notes[idx]) : ""}
                    onChange={(e) => handleNoteChange(idx, e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="text-center py-12 border-t border-slate-200 bg-white mt-16 shadow-inner text-slate-400">
        <div className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] mb-2">
          <Info size={12} />
          <span>Sincronizado en tiempo real</span>
        </div>
        <p className="text-[9px] font-bold uppercase tracking-widest">Nico & Flor 2026</p>
      </footer>
    </div>
  );
}

function LegendItem({ color, label, pulse = false, icon = null }) {
  return (
    <div className="flex items-center gap-2.5 bg-white border border-slate-200 px-5 py-3 rounded-2xl shadow-sm text-[10px] font-black text-slate-600 uppercase tracking-tighter">
      <div className={`w-3.5 h-3.5 rounded-full ${color} ${pulse ? 'animate-pulse' : ''} flex items-center justify-center shadow-inner`}>
        {icon && <span className="text-white scale-[0.6]">{icon}</span>}
      </div>
      <span>{label}</span>
    </div>
  );
}