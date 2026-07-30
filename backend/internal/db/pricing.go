package db

import (
	"database/sql"
	"fmt"

	"github.com/trionell/patchplanner/internal/domain"
)

// Rental pricing storage (Slice 31). Three stores, each read by exactly one
// rule: a user's defaults seed a catalog when it is created, a catalog holds the
// supplier's terms, and an event holds its departures from them.

// GetPricingDefaults returns what a new catalog will copy. The columns are
// NOT NULL, so a user who has never opened the page reads 'onsite' and 25.
func GetPricingDefaults(database *sql.DB, userID int64) (domain.PricingDefaults, error) {
	var defaults domain.PricingDefaults
	err := database.QueryRow(`SELECT default_charged_days, default_vat_percent FROM users WHERE id = ?`, userID).
		Scan(&defaults.ChargedDays, &defaults.VATPercent)
	if err != nil {
		return domain.PricingDefaults{}, fmt.Errorf("get pricing defaults: %w", err)
	}
	return defaults, nil
}

// SetPricingDefaults stores them. It deliberately reaches no further: a catalog
// that already exists keeps whatever it has, which is what the page says.
func SetPricingDefaults(database *sql.DB, userID int64, defaults domain.PricingDefaults) (domain.PricingDefaults, error) {
	_, err := database.Exec(`UPDATE users SET default_charged_days = ?, default_vat_percent = ? WHERE id = ?`,
		defaults.ChargedDays, defaults.VATPercent, userID)
	if err != nil {
		return domain.PricingDefaults{}, fmt.Errorf("set pricing defaults: %w", err)
	}
	return GetPricingDefaults(database, userID)
}

// GetInventoryPricing returns a catalog's terms and its whole rate card.
func GetInventoryPricing(database *sql.DB, inventoryID int64) (domain.InventoryPricing, error) {
	var pricing domain.InventoryPricing
	err := database.QueryRow(`SELECT charged_days, vat_percent FROM inventories WHERE id = ?`, inventoryID).
		Scan(&pricing.ChargedDays, &pricing.VATPercent)
	if err != nil {
		return domain.InventoryPricing{}, fmt.Errorf("get inventory pricing: %w", err)
	}
	factors, err := ListRentFactors(database, inventoryID)
	if err != nil {
		return domain.InventoryPricing{}, err
	}
	pricing.Factors = factors
	return pricing, nil
}

// SetInventoryPricing writes the catalog's own two terms. The rate card is not
// here: it is edited row by row, so a drawer that is mid-edit cannot post a
// stale copy of the whole curve over a row somebody else just changed.
func SetInventoryPricing(database *sql.DB, inventoryID int64, chargedDays string, vatPercent float64) error {
	_, err := database.Exec(`UPDATE inventories SET charged_days = ?, vat_percent = ? WHERE id = ?`,
		chargedDays, vatPercent, inventoryID)
	if err != nil {
		return fmt.Errorf("set inventory pricing: %w", err)
	}
	return nil
}

// SetInventoryVATPercent writes only the rate, for an import that found one in
// the file. Whether the file stated it is reported in the import's warnings and
// recorded nowhere — a stored provenance would keep claiming "from the file"
// after somebody edited the field.
func SetInventoryVATPercent(exec execer, inventoryID int64, vatPercent float64) error {
	if _, err := exec.Exec(`UPDATE inventories SET vat_percent = ? WHERE id = ?`, vatPercent, inventoryID); err != nil {
		return fmt.Errorf("set inventory vat: %w", err)
	}
	return nil
}

// ListRentFactors returns the rate card ordered by days ascending. The order is
// guaranteed here rather than by the caller, because domain.LookupRentFactor
// assumes it and the drawer renders a curve rather than an insertion log.
func ListRentFactors(database *sql.DB, inventoryID int64) ([]domain.RentFactor, error) {
	rows, err := database.Query(`SELECT id, days, factor FROM inventory_rent_factors WHERE inventory_id = ? ORDER BY days ASC`, inventoryID)
	if err != nil {
		return nil, fmt.Errorf("list rent factors: %w", err)
	}
	defer rows.Close()

	factors := make([]domain.RentFactor, 0)
	for rows.Next() {
		var factor domain.RentFactor
		if err := rows.Scan(&factor.ID, &factor.Days, &factor.Factor); err != nil {
			return nil, fmt.Errorf("scan rent factor: %w", err)
		}
		factors = append(factors, factor)
	}
	return factors, rows.Err()
}

// CreateRentFactor adds one row. A day count this catalog already has yields
// ErrDuplicate: the table is one curve, and two answers for five days is a row
// that cannot exist rather than a conflict to resolve at read time.
func CreateRentFactor(database *sql.DB, inventoryID int64, days int, factor float64) (domain.RentFactor, error) {
	taken, err := rentFactorDaysTaken(database, inventoryID, days, 0)
	if err != nil {
		return domain.RentFactor{}, err
	}
	if taken {
		return domain.RentFactor{}, fmt.Errorf("%w: this catalog already has a factor for %d days", ErrDuplicate, days)
	}
	result, err := database.Exec(`INSERT INTO inventory_rent_factors (inventory_id, days, factor) VALUES (?, ?, ?)`,
		inventoryID, days, factor)
	if err != nil {
		return domain.RentFactor{}, fmt.Errorf("create rent factor: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.RentFactor{}, fmt.Errorf("rent factor last insert id: %w", err)
	}
	return domain.RentFactor{ID: id, Days: days, Factor: factor}, nil
}

// UpdateRentFactor changes a row in place. Scoped by inventory as well as by id,
// so a row id from another catalog is a miss rather than a cross-catalog write.
func UpdateRentFactor(database *sql.DB, inventoryID, factorID int64, days int, factor float64) (domain.RentFactor, error) {
	taken, err := rentFactorDaysTaken(database, inventoryID, days, factorID)
	if err != nil {
		return domain.RentFactor{}, err
	}
	if taken {
		return domain.RentFactor{}, fmt.Errorf("%w: this catalog already has a factor for %d days", ErrDuplicate, days)
	}
	result, err := database.Exec(`UPDATE inventory_rent_factors SET days = ?, factor = ? WHERE id = ? AND inventory_id = ?`,
		days, factor, factorID, inventoryID)
	if err != nil {
		return domain.RentFactor{}, fmt.Errorf("update rent factor: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return domain.RentFactor{}, sql.ErrNoRows
	}
	return domain.RentFactor{ID: factorID, Days: days, Factor: factor}, nil
}

func DeleteRentFactor(database *sql.DB, inventoryID, factorID int64) error {
	result, err := database.Exec(`DELETE FROM inventory_rent_factors WHERE id = ? AND inventory_id = ?`, factorID, inventoryID)
	if err != nil {
		return fmt.Errorf("delete rent factor: %w", err)
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// ReplaceRentFactors swaps a catalog's whole rate card for the imported one, in
// one transaction.
//
// Replacement rather than an upsert, and no is_manual to protect: a hand-typed
// 5-day factor and an imported one are ONE FACT DISAGREEING, not two things that
// can coexist (research.md R7). A caller that found no rows in the file must not
// call this at all — an import carrying no table leaves the table alone, which
// is what makes the blank generated template harmless.
func ReplaceRentFactors(database *sql.DB, inventoryID int64, factors []domain.RentFactor) error {
	tx, err := database.Begin()
	if err != nil {
		return fmt.Errorf("replace rent factors: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM inventory_rent_factors WHERE inventory_id = ?`, inventoryID); err != nil {
		return fmt.Errorf("clear rent factors: %w", err)
	}
	for _, factor := range factors {
		if _, err := tx.Exec(`INSERT INTO inventory_rent_factors (inventory_id, days, factor) VALUES (?, ?, ?)`,
			inventoryID, factor.Days, factor.Factor); err != nil {
			return fmt.Errorf("insert rent factor for %d days: %w", factor.Days, err)
		}
	}
	return tx.Commit()
}

// execer is the subset of *sql.DB and *sql.Tx the import path needs, so a
// service can write inside its own transaction or outside one.
type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

// rentFactorDaysTaken is the explicit pre-check the rest of this package uses
// for uniqueness (see categoryNameTaken), rather than reading a message off the
// driver's constraint error. The UNIQUE index is still there as the backstop —
// this is what turns it into an ErrDuplicate somebody can read.
func rentFactorDaysTaken(database *sql.DB, inventoryID int64, days int, excludeID int64) (bool, error) {
	var exists bool
	err := database.QueryRow(`SELECT EXISTS(SELECT 1 FROM inventory_rent_factors WHERE inventory_id = ? AND days = ? AND id <> ?)`,
		inventoryID, days, excludeID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check duplicate rent factor: %w", err)
	}
	return exists, nil
}
