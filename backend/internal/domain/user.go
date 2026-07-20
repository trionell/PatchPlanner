package domain

type User struct {
	ID          int64  `json:"id"`
	GoogleSub   string `json:"-"`
	Email       string `json:"email"`
	Name        string `json:"name"`
	PictureURL  string `json:"pictureUrl,omitempty"`
	CreatedAt   string `json:"createdAt"`
	LastLoginAt string `json:"lastLoginAt"`
}
