import React, { useEffect, useRef, useState } from "react";
import "./OccasionForm.css";

const THEMES = [
  { id: "dark", name: "Dark", note: "Deep tones, quiet and dramatic", color: "dark" },
  { id: "romantic", name: "Romantic", note: "Warm color and a little tenderness", color: "romantic" },
  { id: "aesthetic-glow", name: "Aesthetic Glow", note: "Soft light with a dreamy finish", color: "glow" },
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

export default function OccasionForm({ onSubmit, initialValues = {} }) {
  const [formData, setFormData] = useState({
    title: initialValues.occasionTitle ?? "",
    message: initialValues.message ?? "",
    theme: initialValues.theme ?? THEMES[0].id,
    musicUrl: initialValues.musicUrl ?? "",
  });
  const [photos, setPhotos] = useState([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const objectUrls = useRef(new Set());

  function updateFormData(field, value) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => () => {
    objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function addPhotoUrl(event) {
    event.preventDefault();
    const url = safeWebUrl(photoUrl.trim());
    if (!url) {
      setError("Enter a valid image URL starting with http:// or https://.");
      return;
    }

    setPhotos((current) => [...current, { id: makeId(), kind: "url", url, preview: url }]);
    setPhotoUrl("");
    setError("");
  }

  function addPhotoFiles(event) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/"));
    const additions = files.map((file) => {
      const preview = URL.createObjectURL(file);
      objectUrls.current.add(preview);
      return { id: makeId(), kind: "file", file, preview };
    });
    setPhotos((current) => [...current, ...additions]);
    setError("");
    event.target.value = "";
  }

  function removePhoto(photo) {
    if (photo.kind === "file") {
      URL.revokeObjectURL(photo.preview);
      objectUrls.current.delete(photo.preview);
    }
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!formData.title.trim()) {
      setError("Add an occasion title to continue.");
      return;
    }

    const payload = {
      occasionTitle: formData.title.trim(),
      message: formData.message.trim(),
      theme: formData.theme,
      musicUrl: safeWebUrl(formData.musicUrl.trim()),
      photos: photos.map((photo) => photo.kind === "url"
        ? { kind: "url", url: photo.url }
        : { kind: "file", name: photo.file.name, type: photo.file.type, size: photo.file.size }),
    };

    setError("");
    setIsSaving(true);

    try {
      await onSubmit?.(payload);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save your occasion.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedTheme = THEMES.find((item) => item.id === formData.theme) ?? THEMES[0];
  const audioSource = safeWebUrl(formData.musicUrl.trim());

  return (
    <main className="occasion-form-shell">
      <header className="occasion-heading">
        <p className="occasion-kicker">A little something, made personal</p>
        <h1>Create an occasion</h1>
        <p>Gather the words, music, and moments you want to share.</p>
      </header>

      <div className="occasion-workspace">
        <form className="occasion-editor" onSubmit={handleSubmit}>
          <section className="occasion-section">
            <div className="section-heading">
              <span className="section-number">01</span>
              <h2>The occasion</h2>
            </div>
            <label className="field-label" htmlFor="occasion-title">Occasion title</label>
            <input
              id="occasion-title"
              className="text-input"
              value={formData.title}
              onChange={(event) => updateFormData("title", event.target.value)}
              placeholder="Happy Birthday Sara!"
              maxLength={80}
              required
            />
            <div className="field-meta"><span>Make it yours</span><span>{formData.title.length}/80</span></div>

            <label className="field-label message-label" htmlFor="occasion-message">Custom message / notes</label>
            <textarea
              id="occasion-message"
              className="text-input message-input"
              value={formData.message}
              onChange={(event) => updateFormData("message", event.target.value)}
              placeholder="Write a note that feels like you..."
              rows={5}
              maxLength={500}
            />
            <div className="field-meta"><span>This appears with your occasion</span><span>{formData.message.length}/500</span></div>
          </section>

          <section className="occasion-section">
            <div className="section-heading">
              <span className="section-number">02</span>
              <h2>Choose a theme</h2>
            </div>
            <div className="theme-options" role="group" aria-label="Theme selection">
              {THEMES.map((item) => (
                <button
                  className={`theme-option theme-${item.id}${formData.theme === item.id ? " is-selected" : ""}`}
                  key={item.id}
                  type="button"
                  aria-pressed={formData.theme === item.id}
                  onClick={() => updateFormData("theme", item.id)}
                >
                  <span className="theme-mark" aria-hidden="true">{item.id === "dark" ? "◐" : item.id === "romantic" ? "♡" : "✧"}</span>
                  <span className="theme-copy"><strong>{item.name}</strong><small>{item.note}</small></span>
                  <span className="theme-check" aria-hidden="true">{formData.theme === item.id ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="occasion-section">
            <div className="section-heading">
              <span className="section-number">03</span>
              <h2>Set the mood</h2>
            </div>
            <label className="field-label" htmlFor="music-url">Music URL <span className="optional-label">Optional</span></label>
            <input
              id="music-url"
              className="text-input"
              type="url"
              value={formData.musicUrl}
              onChange={(event) => updateFormData("musicUrl", event.target.value)}
              placeholder="https://..."
            />
          </section>

          <section className="occasion-section photo-section">
            <div className="section-heading">
              <span className="section-number">04</span>
              <h2>Add your photos</h2>
            </div>
            <label className="field-label" htmlFor="photo-url">Image URL <span className="optional-label">Optional</span></label>
            <div className="inline-entry">
              <input
                id="photo-url"
                className="text-input"
                type="url"
                value={photoUrl}
                onChange={(event) => setPhotoUrl(event.target.value)}
                placeholder="https://example.com/photo.jpg"
              />
              <button className="add-button" type="button" onClick={addPhotoUrl}>Add URL</button>
            </div>
            <label className="upload-control" htmlFor="photo-files">
              <span className="upload-icon" aria-hidden="true">＋</span>
              <span><strong>Choose photos</strong><small>Image files from your device</small></span>
              <input id="photo-files" type="file" accept="image/*" multiple onChange={addPhotoFiles} />
            </label>

            {photos.length > 0 && (
              <ul className="photo-list" aria-label="Added photos">
                {photos.map((photo, index) => (
                  <li className="photo-item" key={photo.id}>
                    <img src={photo.preview} alt={`Photo ${index + 1} preview`} />
                    <span>{photo.kind === "file" ? photo.file.name : new URL(photo.url).hostname}</span>
                    <button type="button" className="remove-photo" onClick={() => removePhoto(photo)} aria-label={`Remove photo ${index + 1}`}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="form-footer">
            <div className="form-feedback" role="status" aria-live="polite">
              {error && <span className="error-message">{error}</span>}
            </div>
            <button className="submit-button" type="submit" disabled={isSaving}>
              {isSaving ? "Preparing payment..." : "Continue"} {!isSaving && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </form>

        <aside className={`occasion-phone theme-${selectedTheme.id}`} aria-label="Live mobile preview">
          <span className="phone-notch" aria-hidden="true" />
          <div className="phone-status"><span>9:41</span><span aria-hidden="true">● ● ● ▰</span></div>
          <div className="phone-screen">
            <div className="preview-topline"><span>LIVE PREVIEW</span><span className="preview-spark" aria-hidden="true">✦</span></div>
            <div className="preview-art" aria-hidden="true">
              <span className="art-orbit orbit-one" />
              <span className="art-orbit orbit-two" />
              <span className="art-center">{selectedTheme.id === "dark" ? "◐" : selectedTheme.id === "romantic" ? "♡" : "✧"}</span>
              <span className="art-dot dot-one" />
              <span className="art-dot dot-two" />
              <span className="art-dot dot-three" />
            </div>
            <p className="preview-theme">{selectedTheme.name}</p>
            <h2>{formData.title.trim() || "Your occasion title"}</h2>
            <p className="preview-message">{formData.message.trim() || "Your personal note will find its place here."}</p>
            {photos.length > 0 && (
              <div className="preview-photos">
                {photos.slice(0, 3).map((photo) => <img src={photo.preview} alt="" key={photo.id} />)}
                {photos.length > 3 && <span className="photo-overflow">+{photos.length - 3}</span>}
              </div>
            )}
            {audioSource && <audio className="preview-audio" controls src={audioSource}>Your browser does not support audio playback.</audio>}
            <div className="preview-bottom"><span>Made with care</span><span aria-hidden="true">✳</span></div>
          </div>
          <span className="phone-home-indicator" aria-hidden="true" />
        </aside>
      </div>
    </main>
  );
}