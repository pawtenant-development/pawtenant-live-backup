-- Master email layout: one editable HTML shell with {{content}} placeholder
-- Stored in comms_settings under key 'email_layout_html'
-- If empty/NULL, edge functions fall back to their built-in baseLayout()

INSERT INTO comms_settings (key, value) VALUES
  ('email_layout_html', NULL),
  ('email_layout_updated_at', NULL)
ON CONFLICT (key) DO NOTHING;
