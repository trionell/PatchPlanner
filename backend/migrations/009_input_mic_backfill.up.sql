UPDATE audio_patch_inputs
SET mic_item_id = (
  SELECT i.id FROM inventory_items i
  WHERE LOWER(i.name) = LOWER(audio_patch_inputs.mic_model)
  ORDER BY i.id ASC
  LIMIT 1
)
WHERE mic_item_id IS NULL
  AND mic_model IS NOT NULL
  AND TRIM(mic_model) <> ''
