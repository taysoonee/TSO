// Initialize Lucide Icons
lucide.createIcons();

// SHA-256 Hashing helper
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hashed TSO password (Pre-computed hash of "TSO2026")
const TSO_HASH = "e3494e6fa1a8de4dd913fb8526790e369fd903e8ca1a5f5770bb6496a5c27a51";

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const dashboardContent = document.getElementById('dashboardContent');
    const passwordInput = document.getElementById('passwordInput');
    const unlockBtn = document.getElementById('unlockBtn');
    const errorMsg = document.getElementById('authError');
    const searchInput = document.getElementById('searchInput');
    const projectCards = document.querySelectorAll('.project-card');

    // Check if already authenticated in this session
    if (sessionStorage.getItem('tso_authenticated') === 'true') {
        authOverlay.style.display = 'none';
        dashboardContent.style.display = 'block';
    }

    // Unlock handler
    async function handleUnlock() {
        const password = passwordInput.value;
        const hashedInput = await sha256(password);

        if (hashedInput === TSO_HASH) {
            sessionStorage.setItem('tso_authenticated', 'true');
            // Transition effect
            authOverlay.style.opacity = '0';
            setTimeout(() => {
                authOverlay.style.display = 'none';
                dashboardContent.style.display = 'block';
                lucide.createIcons(); // Re-render icons once dashboard is visible
            }, 500);
        } else {
            errorMsg.textContent = "Invalid access key. Please try again.";
            passwordInput.value = '';
            passwordInput.focus();
        }
    }

    unlockBtn.addEventListener('click', handleUnlock);
    passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleUnlock();
    });

    // Search functionality
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        projectCards.forEach(card => {
            const title = card.querySelector('h2').textContent.toLowerCase();
            const description = card.querySelector('.description').textContent.toLowerCase();
            const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());

            const matchesSearch = title.includes(searchTerm) || 
                                  description.includes(searchTerm) || 
                                  tags.some(tag => tag.includes(searchTerm));

            if (matchesSearch) {
                card.style.display = 'flex';
                card.style.animation = 'fadeIn 0.3s ease forwards';
            } else {
                card.style.display = 'none';
            }
        });
    });
});

// Add keyframe for fadeIn animation programmatically if not in CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);
