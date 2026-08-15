// The canonical list of editable storefront content.
//
// `text` values here are the literals the components shipped with, so seeding
// leaves the site looking byte-identical. tl-ui keeps a mirror of these in
// src/content/defaults.js as its offline fallback — keep the two in step.
//
// Order within this array becomes sort_order, which is what the admin UI sorts by.

const CONTENT_KEYS = [
  // ---------- Hero ----------
  {
    name: 'hero.image',
    type: 'image',
    section: 'hero',
    label: 'Background Image',
    text: 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?q=80&w=2515&auto=format&fit=crop'
  },
  { name: 'hero.image_alt', section: 'hero', label: 'Background Image Alt Text', text: 'Diamond Ring Close up' },
  { name: 'hero.eyebrow', section: 'hero', label: 'Eyebrow', text: 'Established 2026' },
  { name: 'hero.title', section: 'hero', label: 'Headline', text: 'The Signature Series' },
  { name: 'hero.cta', section: 'hero', label: 'Button Label', text: 'Shop the Collection' },

  // ---------- Collections ----------
  { name: 'collections.heading', section: 'collections', label: 'Heading', text: 'Latest Arrivals' },
  {
    name: 'collections.body',
    type: 'textarea',
    section: 'collections',
    label: 'Description',
    text: 'Discover our curated selection of premium goods, designed for the modern connoisseur.'
  },

  // ---------- About: hero band ----------
  {
    name: 'about.hero_image',
    type: 'image',
    section: 'about',
    group_label: 'Hero Band',
    label: 'Hero Image',
    text: 'https://images.unsplash.com/photo-1617038224538-2763fcc16382?q=80&w=2000&auto=format&fit=crop'
  },
  { name: 'about.hero_image_alt', section: 'about', group_label: 'Hero Band', label: 'Hero Image Alt Text', text: 'Jeweler working' },
  { name: 'about.hero_title', section: 'about', group_label: 'Hero Band', label: 'Headline', text: 'The Art of Timelessness' },
  { name: 'about.hero_eyebrow', section: 'about', group_label: 'Hero Band', label: 'Eyebrow', text: 'Est. 2026' },

  // ---------- About: story ----------
  {
    name: 'about.story_image',
    type: 'image',
    section: 'about',
    group_label: 'Story',
    label: 'Story Image',
    text: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?q=80&w=1000&auto=format&fit=crop'
  },
  { name: 'about.story_image_alt', section: 'about', group_label: 'Story', label: 'Story Image Alt Text', text: 'Craftsmanship process' },
  { name: 'about.story_heading', section: 'about', group_label: 'Story', label: 'Heading', text: 'Heritage & Quality' },
  {
    name: 'about.story_body1',
    type: 'textarea',
    section: 'about',
    group_label: 'Story',
    label: 'Paragraph 1',
    text: 'Founded on the principles of classic elegance and modern sensibility, Tehila Levi is more than a jewelry brand; it is a celebration of enduring beauty. Every piece is a testament to the meticulous art of jewelry making, designed not just for today, but to be cherished for generations.'
  },
  {
    name: 'about.story_body2',
    type: 'textarea',
    section: 'about',
    group_label: 'Story',
    label: 'Paragraph 2',
    text: 'We believe in slow fashion—creating fewer, better things. Our ateliers employ traditional techniques passed down through decades, ensuring that each curve, setting, and polish meets our exacting standards of perfection.'
  },

  // ---------- About: value pillars ----------
  { name: 'about.pillar1.badge', section: 'about', group_label: 'Value Pillar 1', label: 'Number', text: '01' },
  { name: 'about.pillar1.title', section: 'about', group_label: 'Value Pillar 1', label: 'Title', text: 'Ethically Sourced' },
  {
    name: 'about.pillar1.body',
    type: 'textarea',
    section: 'about',
    group_label: 'Value Pillar 1',
    label: 'Description',
    text: 'We are committed to using only conflict-free diamonds and recycled precious metals.'
  },
  { name: 'about.pillar2.badge', section: 'about', group_label: 'Value Pillar 2', label: 'Number', text: '02' },
  { name: 'about.pillar2.title', section: 'about', group_label: 'Value Pillar 2', label: 'Title', text: 'Hand-Crafted' },
  {
    name: 'about.pillar2.body',
    type: 'textarea',
    section: 'about',
    group_label: 'Value Pillar 2',
    label: 'Description',
    text: 'Each piece is finished by hand in our Los Angeles studio by master jewelers.'
  },
  { name: 'about.pillar3.badge', section: 'about', group_label: 'Value Pillar 3', label: 'Number', text: '03' },
  { name: 'about.pillar3.title', section: 'about', group_label: 'Value Pillar 3', label: 'Title', text: 'Lifetime Warranty' },
  {
    name: 'about.pillar3.body',
    type: 'textarea',
    section: 'about',
    group_label: 'Value Pillar 3',
    label: 'Description',
    text: 'We stand behind the quality of our jewelry with a comprehensive lifetime guarantee.'
  },

  // ---------- Contact: page header ----------
  { name: 'contact.heading', section: 'contact', group_label: 'Page Header', label: 'Heading', text: 'Contact Us' },
  { name: 'contact.subtitle', section: 'contact', group_label: 'Page Header', label: 'Subtitle', text: "We'd love to hear from you" },

  // ---------- Contact: boutique ----------
  { name: 'contact.boutique_heading', section: 'contact', group_label: 'Boutique', label: 'Heading', text: 'Visit the Boutique' },
  { name: 'contact.address_line1', section: 'contact', group_label: 'Boutique', label: 'Address Line 1', text: '123 Rodeo Drive' },
  { name: 'contact.address_line2', section: 'contact', group_label: 'Boutique', label: 'Address Line 2', text: 'Beverly Hills, CA 90210' },
  { name: 'contact.phone_display', section: 'contact', group_label: 'Boutique', label: 'Phone (as shown)', text: '+1 (310) 555-0123' },
  // Stored without the tel: prefix; Contact.jsx adds it, so the two can't drift.
  { name: 'contact.phone_tel', section: 'contact', group_label: 'Boutique', label: 'Phone (dial format)', text: '+13105550123' },

  // ---------- Contact: map ----------
  {
    name: 'contact.map_image',
    type: 'image',
    section: 'contact',
    group_label: 'Map',
    label: 'Map Image',
    text: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1000&auto=format&fit=crop'
  },
  { name: 'contact.map_image_alt', section: 'contact', group_label: 'Map', label: 'Map Image Alt Text', text: 'Map location' },
  { name: 'contact.map_label', section: 'contact', group_label: 'Map', label: 'Overlay Label', text: 'View on Google Maps' },
  // Empty by default: the overlay stays a plain badge until a link is provided.
  { name: 'contact.map_url', section: 'contact', group_label: 'Map', label: 'Map Link URL (optional)', text: '' },

  // ---------- Contact: opening hours ----------
  { name: 'contact.hours_heading', section: 'contact', group_label: 'Opening Hours', label: 'Heading', text: 'Hours' },
  { name: 'contact.hours1_label', section: 'contact', group_label: 'Opening Hours', label: 'Row 1 Days', text: 'Monday - Friday' },
  { name: 'contact.hours1_value', section: 'contact', group_label: 'Opening Hours', label: 'Row 1 Hours', text: '10am — 7pm' },
  { name: 'contact.hours2_label', section: 'contact', group_label: 'Opening Hours', label: 'Row 2 Days', text: 'Saturday' },
  { name: 'contact.hours2_value', section: 'contact', group_label: 'Opening Hours', label: 'Row 2 Hours', text: '11am — 5pm' },
  { name: 'contact.hours3_label', section: 'contact', group_label: 'Opening Hours', label: 'Row 3 Days', text: 'Sunday' },
  { name: 'contact.hours3_value', section: 'contact', group_label: 'Opening Hours', label: 'Row 3 Hours', text: 'By Appointment' },

  // ---------- Contact: form ----------
  { name: 'contact.form_heading', section: 'contact', group_label: 'Inquiry Form', label: 'Heading', text: 'Bespoke Inquiries' },
  { name: 'contact.form_label_name', section: 'contact', group_label: 'Inquiry Form', label: 'Name Field Label', text: 'Name' },
  { name: 'contact.form_label_email', section: 'contact', group_label: 'Inquiry Form', label: 'Email Field Label', text: 'Email' },
  { name: 'contact.form_label_subject', section: 'contact', group_label: 'Inquiry Form', label: 'Subject Field Label', text: 'Subject' },
  { name: 'contact.form_label_message', section: 'contact', group_label: 'Inquiry Form', label: 'Message Field Label', text: 'Message' },
  { name: 'contact.form_submit', section: 'contact', group_label: 'Inquiry Form', label: 'Submit Button Label', text: 'Send Message' },
  {
    name: 'contact.form_success',
    type: 'textarea',
    section: 'contact',
    group_label: 'Inquiry Form',
    label: 'Confirmation Message',
    text: 'Thank you for your inquiry. We will respond shortly.'
  },

  // ---------- Contact: subject options ----------
  // Option 1 doubles as the form's initial value.
  { name: 'contact.subject1', section: 'contact', group_label: 'Subject Options', label: 'Option 1 (default)', text: 'General Inquiry' },
  { name: 'contact.subject2', section: 'contact', group_label: 'Subject Options', label: 'Option 2', text: 'Bespoke Commission' },
  { name: 'contact.subject3', section: 'contact', group_label: 'Subject Options', label: 'Option 3', text: 'Private Viewing Appointment' },
  { name: 'contact.subject4', section: 'contact', group_label: 'Subject Options', label: 'Option 4', text: 'Press & Media' },

  // ---------- Footer ----------
  { name: 'footer.brand', section: 'footer', label: 'Brand Name', text: 'Tehila Levi' },
  { name: 'footer.rights', section: 'footer', label: 'Rights Notice', text: 'All rights reserved.' }
];

const SECTIONS = ['hero', 'collections', 'about', 'contact', 'footer'];

module.exports = { CONTENT_KEYS, SECTIONS };
