# TWSS — Technical Work for Software & Solutions

Premium technical education platform combining courses, payment integration, and learning management.

## Features

- **Landing Page** — Luxury monochrome design with video hero, custom cursor, scroll animations
- **Courses** — Premium course catalog with Razorpay payment integration and coupon system
- **Dashboard** — Purchase lookup and content access with Supabase backend
- **About** — Mission, values, and team information
- **Contact** — Contact form with EmailJS integration

## Tech Stack

- Static HTML/CSS/JavaScript
- [Supabase](https://supabase.com) — Database & Auth
- [Razorpay](https://razorpay.com) — Payment Gateway
- [EmailJS](https://emailjs.com) — Contact Form
- Google Fonts (Cormorant Garamond, Syne, Plus Jakarta Sans)
- Font Awesome Icons

## Structure

```
├── index.html          # Landing page
├── courses.html        # Course catalog with payment
├── dashboard.html      # Purchase dashboard
├── about.html          # About page
├── contact.html        # Contact page
├── css/
│   ├── style.css       # Shared design system
│   ├── courses.css     # Courses page styles
│   ├── dashboard.css   # Dashboard styles
│   ├── about.css       # About page styles
│   └── contact.css     # Contact page styles
├── js/
│   ├── app.js          # Shared application logic
│   ├── courses.js      # Courses & payment logic
│   └── dashboard.js    # Dashboard logic
└── course/             # Individual course content pages
```

## Deployment

This site is deployed on GitHub Pages.

## License

&copy; 2026 TWSS Initiative. All Rights Reserved.
