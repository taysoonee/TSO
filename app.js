// Initialize Lucide Icons
lucide.createIcons();

// Search functionality
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const projectCards = document.querySelectorAll('.project-card');

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();

        projectCards.forEach(card => {
            const title = card.querySelector('h2').textContent.toLowerCase();
            const description = card.querySelector('.description').textContent.toLowerCase();
            
            // Get all tags text
            const tags = Array.from(card.querySelectorAll('.tag'))
                            .map(tag => tag.textContent.toLowerCase());
            
            // Check if search term matches title, description, or any tag
            const matchesSearch = title.includes(searchTerm) || 
                                  description.includes(searchTerm) || 
                                  tags.some(tag => tag.includes(searchTerm));

            if (matchesSearch) {
                card.style.display = 'flex';
                // Add a small animation effect when showing
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
