const openPhoto = () => QCAvatar.open({ onChange: () => updateIdHero() });
document.getElementById("qc-photo-btn").addEventListener("click", openPhoto);
document.getElementById("qc-photo-link").addEventListener("click", openPhoto);
document.getElementById("qc-id-avatar").addEventListener("click", openPhoto);
document.getElementById("qc-id-avatar").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPhoto(); } });
// the photo is fetched in the background after load: refresh the hero once it arrives
setTimeout(() => { if (typeof updateIdHero === "function") updateIdHero(); }, 900);
QCPush.mountCard(document.getElementById("qc-notify-card"));
