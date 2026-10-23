/* ========================================================
   Foto de referência — componente React + @capacitor/camera
   (sem bundler: React 18 UMD em www/vendor, plugin acessado via
   window.Capacitor.Plugins, que o Capacitor injeta no app nativo)
   ======================================================== */
(function () {
  const { createElement: h, useState, useEffect } = React;

  // Plugin nativo (undefined no navegador comum -> usamos fallback de <input file>)
  function getCameraPlugin() {
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    return (cap.Plugins && cap.Plugins.Camera) || cap.registerPlugin('Camera');
  }

  // Fallback só para testar no navegador do PC
  function pickFileOnWeb() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        f ? resolve({ webPath: URL.createObjectURL(f) }) : reject(new Error('User cancelled photos app'));
      };
      input.oncancel = () => reject(new Error('User cancelled photos app'));
      input.click();
    });
  }

  // 1) Verifica e 2) pede as permissões do Android (câmera + fotos)
  async function ensurePermissions(Camera) {
    let perms = await Camera.checkPermissions();
    console.log('[camera] permissões atuais:', JSON.stringify(perms));

    const ok = (p) => p === 'granted' || p === 'limited';
    if (ok(perms.camera) && ok(perms.photos)) return true;

    perms = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    console.log('[camera] após solicitar:', JSON.stringify(perms));

    // Só bloqueia se negou tudo. Se negou só um, o usuário ainda pode usar
    // a outra opção (ex.: galeria no Android 13+ usa o Photo Picker sem permissão).
    return ok(perms.camera) || ok(perms.photos);
  }

  function isCancel(err) {
    const msg = String((err && (err.message || err)) || '').toLowerCase();
    return msg.includes('cancel');
  }

  function CameraField() {
    const [photoUrl, setPhotoUrl] = useState(null); // webPath da foto
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const notify = (msg) => window.showToast && window.showToast(msg);

    function updatePhoto(url) {
      setPhotoUrl(url);
      window.onPhotoChange && window.onPhotoChange(url);
    }

    async function takeOrPickPhoto() {
      setLoading(true);
      setError(null);
      try {
        const Camera = getCameraPlugin();
        let photo;

        if (Camera) {
          const granted = await ensurePermissions(Camera);
          if (!granted) {
            setError('Permissão negada. Ative Câmera/Fotos nas configurações do app para anexar uma imagem.');
            return;
          }
          // source: 'prompt' -> diálogo do Android "Câmera ou Galeria"
          photo = await Camera.getPhoto({
            quality: 80,
            allowEditing: false,
            resultType: 'uri', // devolve webPath
            source: 'prompt',
            promptLabelHeader: 'Foto de referência',
            promptLabelPhoto: 'Escolher da galeria',
            promptLabelPicture: 'Tirar foto',
            promptLabelCancel: 'Cancelar',
          });
        } else {
          photo = await pickFileOnWeb();
        }

        console.log('[camera] webPath:', photo.webPath);
        updatePhoto(photo.webPath);
      } catch (err) {
        // Promise rejeitada: usuário cancelou / voltou, ou erro real. Nunca trava o app.
        if (isCancel(err)) {
          console.log('[camera] cancelado pelo usuário');
          notify('Captura cancelada.');
        } else {
          console.error('[camera] erro:', err);
          setError('Não foi possível obter a foto. Tente novamente.');
        }
      } finally {
        setLoading(false);
      }
    }

    // Permite que o código fora do React limpe a foto ("Novo agendamento")
    useEffect(() => {
      window.cameraApi = {
        reset: () => { setPhotoUrl(null); setError(null); },
      };
      return () => { delete window.cameraApi; };
    }, []);

    const cameraIcon = h('svg', { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: '#c6a15b', strokeWidth: 1.3 },
      h('path', { d: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', strokeLinejoin: 'round' }),
      h('circle', { cx: 12, cy: 13.5, r: 3.4 }));

    // Renderização condicional: com foto -> preview; sem foto -> botão
    const content = photoUrl
      ? h('div', { className: 'camera-result', style: { display: 'block' } },
          h('img', { src: photoUrl, alt: 'Foto de referência selecionada', id: 'camPhoto' }),
          h('div', { className: 'camera-result-actions' },
            h('button', { type: 'button', className: 'btn-outline', onClick: takeOrPickPhoto, disabled: loading }, 'Trocar foto'),
            h('button', { type: 'button', className: 'cam-remove', 'aria-label': 'Remover foto', onClick: () => updatePhoto(null) }, '✕')))
      : h('div', { className: 'camera-empty' },
          cameraIcon,
          h('p', null, 'Mostre à cabeleireira o corte, cor ou inspiração que você tem em mente.'),
          error && h('div', { className: 'camera-error-msg', style: { padding: '4px 0' } }, error),
          h('button', { type: 'button', className: 'btn-outline', id: 'camOpenBtn', onClick: takeOrPickPhoto, disabled: loading },
            loading ? 'Abrindo…' : 'Tirar Foto / Galeria'));

    return h('div', { className: 'camera-box' + (error ? ' cam-error' : '') }, content);
  }

  ReactDOM.createRoot(document.getElementById('camera-root')).render(h(CameraField));
})();
