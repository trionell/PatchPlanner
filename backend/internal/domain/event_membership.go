package domain

// EventMembership is one row on an event's members list — either the
// owner (Role "owner") or an invited collaborator ("contributor" |
// "viewer"). Denormalized with the joined user's profile fields so the
// frontend never needs a second lookup per row (the project's
// established display-row convention, e.g. ownedItemColumns in owned.go).
type EventMembership struct {
	UserID          int64  `json:"userId"`
	Email           string `json:"email"`
	Name            string `json:"name"`
	PictureURL      string `json:"pictureUrl,omitempty"`
	Role            string `json:"role"`
	InvitedByUserID *int64 `json:"invitedBy,omitempty"`
	CreatedAt       string `json:"createdAt"`
}
