// Initialize Google Identity Services
const GOOGLE_CLIENT_ID = "764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com"; // Workspace Taylor's Schools Client ID
const ALLOWED_DOMAIN = "taylorsschools.com";

// Base64 JWT decoder helper
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Google Sign-In Callback
window.handleCredentialResponse = (response) => {
    const data = parseJwt(response.credential);
    if (data && data.email_verified) {
        const email = data.email;
        if (email.endsWith("@" + ALLOWED_DOMAIN)) {
            sessionStorage.setItem('tso_authenticated_email', email);
            unlockDashboard();
        } else {
            const errorText = document.getElementById('authError');
            errorText.textContent = `Access Denied: ${email} is not authorized. You must sign in with a @${ALLOWED_DOMAIN} account.`;
        }
    } else {
        document.getElementById('authError').textContent = "Google Authentication failed. Please try again.";
    }
};

function unlockDashboard() {
    const authOverlay = document.getElementById('authOverlay');
    const dashboardContent = document.getElementById('dashboardContent');
    authOverlay.style.opacity = '0';
    setTimeout(() => {
        authOverlay.style.display = 'none';
        dashboardContent.style.display = 'block';
        lucide.createIcons();
    }, 500);
}

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const dashboardContent = document.getElementById('dashboardContent');
    const searchInput = document.getElementById('searchInput');
    const projectCards = document.querySelectorAll('.project-card');

    // Check if already authenticated in this session
    const savedEmail = sessionStorage.getItem('tso_authenticated_email');
    if (savedEmail && savedEmail.endsWith("@" + ALLOWED_DOMAIN)) {
        authOverlay.style.display = 'none';
        dashboardContent.style.display = 'block';
        lucide.createIcons();
    } else {
        // Initialize Google Sign-In button
        window.onload = function () {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: window.handleCredentialResponse
            });
            google.accounts.id.renderButton(
                document.getElementById("gSignInButton"),
                { theme: "outline", size: "large", width: "240" }
            );
            google.accounts.id.prompt(); // also display the One Tap dialog
        };
    }

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
