/**
 * Equipment.java
 *
 * Represents one piece of equipment in the Simple Equipment Checkout System.
 * This class is reused from Phase One. It has no linked list fields:
 * an Equipment object describes the equipment itself, while a node
 * (inside EquipmentLinkedList) describes a position in a list.
 */
public class Equipment {

    private String id;          // unique equipment ID, e.g. "E101"
    private String name;        // equipment name, e.g. "Projector"
    private boolean available;  // true = available, false = checked out

    /**
     * Creates a new equipment item. New equipment is available by default.
     *
     * @param id   the (already trimmed and validated) equipment ID
     * @param name the (already trimmed and validated) equipment name
     */
    public Equipment(String id, String name) {
        this.id = id;
        this.name = name;
        this.available = true;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public boolean isAvailable() {
        return available;
    }

    /**
     * Changes the availability of this equipment.
     * Called by the application on checkout (false) and on return (true).
     */
    public void setAvailable(boolean available) {
        this.available = available;
    }

    /**
     * Returns the equipment in the required display format, for example:
     * "E101 - Projector (Available)" or "E101 - Projector (Checked Out)".
     */
    @Override
    public String toString() {
        String status = available ? "Available" : "Checked Out";
        return id + " - " + name + " (" + status + ")";
    }
}
